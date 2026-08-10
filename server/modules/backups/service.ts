import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  LOCAL_BACKUP_FILE_EXTENSION,
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_FORMAT_VERSION,
  type BackupManifestEntry,
  type BackupRestoreResult,
  type BackupSummary,
  type BackupValidationResult,
} from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import {
  createManifest,
  readBackupArtifact,
  sha256,
  writeBackupArtifact,
  type DecodedBackup,
} from './archive-codec.ts';
import { restoreAtomically, type BackupRestoreCoordinator } from './atomic-restore.ts';
import { assertInsideData, assertNonOverlappingScopes, toArchivePath } from './path-policy.ts';
import { collectSnapshot, type BackupSources } from './source-collector.ts';

const defaultMaximumArtifactBytes = 512 * 1024 * 1024;
const defaultMaximumExpandedBytes = 1024 * 1024 * 1024;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BackupServiceConfig extends BackupSources {
  appVersion: string;
  backupDirectory: string;
  maximumArtifactBytes?: number;
  maximumExpandedBytes?: number;
  restoreCoordinator?: BackupRestoreCoordinator;
}

export interface BackupDownload {
  fileName: string;
  path: string;
  summary: BackupSummary;
}

export class LocalBackupService {
  private operation: Promise<void> = Promise.resolve();
  private readonly config: Required<Pick<BackupServiceConfig, 'maximumArtifactBytes' | 'maximumExpandedBytes'>>
    & BackupServiceConfig;
  private readonly allowedScopes: Set<string>;

  constructor(config: BackupServiceConfig) {
    const dataDirectory = resolve(config.dataDirectory);
    const backupDirectory = assertInsideData(dataDirectory, config.backupDirectory);
    if (backupDirectory === dataDirectory) invalid('Backup storage cannot be the data directory itself.');
    const scopes = [
      ...config.sqliteFiles.map((path) => toArchivePath(dataDirectory, path)),
      ...config.directoryScopes.map((path) => toArchivePath(dataDirectory, path)),
    ];
    assertNonOverlappingScopes(scopes);
    if (scopes.some((scope) => backupDirectory.startsWith(`${resolveArchive(dataDirectory, scope)}${separator()}`))) {
      invalid('Backup storage cannot be inside a backed-up scope.');
    }
    this.allowedScopes = new Set(scopes);
    const maximumArtifactBytes = positiveLimit(
      config.maximumArtifactBytes,
      defaultMaximumArtifactBytes,
      'maximumArtifactBytes',
    );
    const maximumExpandedBytes = positiveLimit(
      config.maximumExpandedBytes,
      defaultMaximumExpandedBytes,
      'maximumExpandedBytes',
    );
    this.config = {
      ...config,
      appVersion: config.appVersion.trim() || 'unknown',
      backupDirectory,
      dataDirectory,
      maximumArtifactBytes,
      maximumExpandedBytes,
    };
  }

  async create(now: Date = new Date()): Promise<BackupSummary> {
    return this.exclusive(async () => {
      await mkdir(this.config.backupDirectory, { recursive: true, mode: 0o700 });
      const work = await mkdtemp(join(this.config.backupDirectory, '.create-'));
      const id = randomUUID();
      const destination = this.artifactPath(id);
      try {
        const snapshot = await collectSnapshot(this.config, join(work, 'sqlite'));
        if (snapshot.files.size === 0) invalid('No local data was available to back up.');
        const entries: BackupManifestEntry[] = [...snapshot.files]
          .map(([path, file]) => ({
            kind: file.kind,
            path,
            sha256: sha256(file.contents),
            size: file.contents.length,
          }))
          .sort((left, right) => left.path.localeCompare(right.path));
        const manifest = createManifest({
          appVersion: this.config.appVersion,
          createdAt: now.toISOString(),
          fileCount: entries.length,
          files: entries,
          format: LOCAL_BACKUP_FORMAT,
          formatVersion: LOCAL_BACKUP_FORMAT_VERSION,
          id,
          scopes: [...snapshot.scopes].sort(),
          totalBytes: entries.reduce((total, entry) => total + entry.size, 0),
        });
        const temporaryArtifact = join(work, `${id}${LOCAL_BACKUP_FILE_EXTENSION}`);
        await writeBackupArtifact(
          temporaryArtifact,
          manifest,
          new Map([...snapshot.files].map(([path, file]) => [path, file.contents])),
        );
        const artifactBytes = (await lstat(temporaryArtifact)).size;
        if (artifactBytes > this.config.maximumArtifactBytes) {
          invalid('Created backup exceeds the configured artifact size limit.');
        }
        await readBackupArtifact(
          temporaryArtifact,
          this.config.maximumArtifactBytes,
          this.config.maximumExpandedBytes,
        );
        await rename(temporaryArtifact, destination);
        return await this.summary(destination, { manifest, payload: new Map() });
      } finally {
        await rm(work, { force: true, recursive: true });
      }
    });
  }

  async list(): Promise<BackupSummary[]> {
    await mkdir(this.config.backupDirectory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.config.backupDirectory, { withFileTypes: true });
    const summaries = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(LOCAL_BACKUP_FILE_EXTENSION))
      .map(async (entry) => {
        const path = join(this.config.backupDirectory, entry.name);
        return this.summary(path, await this.readAndAuthorize(path));
      }));
    return summaries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async validate(id: string, now: Date = new Date()): Promise<BackupValidationResult> {
    const backup = await this.readAndAuthorize(this.artifactPath(validId(id)));
    return {
      checkedAt: now.toISOString(),
      fileCount: backup.manifest.fileCount,
      id: backup.manifest.id,
      status: 'valid',
      totalBytes: backup.manifest.totalBytes,
    };
  }

  async download(id: string): Promise<BackupDownload> {
    const path = this.artifactPath(validId(id));
    const backup = await this.readAndAuthorize(path);
    return {
      fileName: `islamic-learning-assistant-${backup.manifest.createdAt.slice(0, 10)}-${backup.manifest.id}${LOCAL_BACKUP_FILE_EXTENSION}`,
      path,
      summary: await this.summary(path, backup),
    };
  }

  async restore(id: string, now: Date = new Date()): Promise<BackupRestoreResult> {
    if (!this.config.restoreCoordinator?.beforeRestore || !this.config.restoreCoordinator.afterRestore) {
      throw new AppError(
        'INVALID_REQUEST',
        'Restore is disabled until an explicit runtime shutdown and restart coordinator is configured.',
        409,
      );
    }
    return this.exclusive(async () => {
      const backupId = validId(id);
      const backup = await this.readAndAuthorize(this.artifactPath(backupId));
      const work = await mkdtemp(join(this.config.backupDirectory, '.restore-'));
      try {
        await restoreAtomically(
          this.config.dataDirectory,
          work,
          backup,
          this.config.restoreCoordinator,
        );
        return {
          backupId,
          completedAt: now.toISOString(),
          restoredFiles: backup.manifest.fileCount,
        };
      } finally {
        await rm(work, { force: true, recursive: true });
      }
    });
  }

  private async readAndAuthorize(path: string): Promise<DecodedBackup> {
    try {
      const backup = await readBackupArtifact(
        path,
        this.config.maximumArtifactBytes,
        this.config.maximumExpandedBytes,
      );
      if (basename(path) !== `${backup.manifest.id}${LOCAL_BACKUP_FILE_EXTENSION}`) {
        invalid('Backup filename and manifest id do not match.');
      }
      if (backup.manifest.scopes.some((scope) => !this.allowedScopes.has(scope))) {
        invalid('Backup requests a restore scope that is not configured.');
      }
      return backup;
    } catch (error) {
      if (isMissing(error)) throw new AppError('INVALID_REQUEST', 'Backup was not found.', 404);
      throw error;
    }
  }

  private async summary(path: string, backup: DecodedBackup): Promise<BackupSummary> {
    const artifact = await readFile(path);
    return {
      appVersion: backup.manifest.appVersion,
      artifactBytes: artifact.length,
      artifactSha256: sha256(artifact),
      createdAt: backup.manifest.createdAt,
      fileCount: backup.manifest.fileCount,
      formatVersion: backup.manifest.formatVersion,
      id: backup.manifest.id,
      totalBytes: backup.manifest.totalBytes,
    };
  }

  private artifactPath(id: string): string {
    return join(this.config.backupDirectory, `${id}${LOCAL_BACKUP_FILE_EXTENSION}`);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operation;
    let release!: () => void;
    this.operation = new Promise<void>((resolveOperation) => { release = resolveOperation; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function validId(id: string): string {
  if (!idPattern.test(id)) invalid('Backup id is invalid.');
  return id.toLowerCase();
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function resolveArchive(dataDirectory: string, scope: string): string {
  return resolve(dataDirectory, ...scope.split('/'));
}

function separator(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1) invalid(`${name} must be a positive safe integer.`);
  return limit;
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 400);
}
