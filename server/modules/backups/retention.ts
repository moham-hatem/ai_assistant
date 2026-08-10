import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rmdir, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { LOCAL_BACKUP_FILE_EXTENSION, type BackupSummary } from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import type { LocalBackupService } from './service.ts';

export interface BackupRetentionPlan {
  confirmation: string;
  delete: BackupSummary[];
  keep: BackupSummary[];
  keepCount: number;
}

export interface RetentionFileOperations {
  lstat(path: string): Promise<{ isFile(): boolean; isSymbolicLink(): boolean }>;
  mkdir(path: string): Promise<unknown>;
  readFile(path: string): Promise<Buffer>;
  rename(source: string, destination: string): Promise<unknown>;
  rmdir(path: string): Promise<unknown>;
  unlink(path: string): Promise<unknown>;
}

const defaultFileOperations: RetentionFileOperations = { lstat, mkdir, readFile, rename, rmdir, unlink };

export function createRetentionPlan(backups: readonly BackupSummary[], keepCount: number): BackupRetentionPlan {
  if (!Number.isSafeInteger(keepCount) || keepCount < 1 || keepCount > 10_000) {
    throw invalid('Retention keep count must be between 1 and 10000.');
  }
  const ordered = [...backups].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const keep = ordered.slice(0, keepCount);
  const remove = ordered.slice(keepCount);
  const digest = createHash('sha256')
    .update(JSON.stringify({
      inventory: ordered.map((item) => ({ artifactSha256: item.artifactSha256, id: item.id })),
      keepCount,
      version: 2,
    }))
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
  return { confirmation: `DELETE-BACKUPS-${digest}`, delete: remove, keep, keepCount };
}

export async function applyRetentionPlan(
  service: LocalBackupService,
  backupDirectory: string,
  expected: BackupRetentionPlan,
  confirmation: string | undefined,
  fileOperations: RetentionFileOperations = defaultFileOperations,
): Promise<string[]> {
  if (expected.delete.length === 0) return [];
  if (confirmation !== expected.confirmation) {
    throw invalid('Retention confirmation does not match the current deletion plan.');
  }
  const current = createRetentionPlan(await service.list(), expected.keepCount);
  if (current.confirmation !== expected.confirmation || !sameIds(current.delete, expected.delete)) {
    throw invalid('Backup inventory changed after preview. Generate a new retention plan.');
  }
  if (current.keep.length < 1) throw invalid('Retention must preserve at least one valid backup.');
  for (const backup of current.keep) await service.validate(backup.id);
  const targets: Array<{ backup: BackupSummary; source: string }> = [];
  for (const backup of current.delete) {
    await service.validate(backup.id);
    targets.push({ backup, source: retentionTarget(backupDirectory, backup.id) });
  }
  return stageAndPurge(backupDirectory, targets, fileOperations);
}

async function stageAndPurge(
  backupDirectory: string,
  targets: readonly { backup: BackupSummary; source: string }[],
  fileOperations: RetentionFileOperations,
): Promise<string[]> {
  const stagingDirectory = retentionStagingDirectory(backupDirectory);
  await fileOperations.mkdir(stagingDirectory);
  const staged: Array<{ source: string; staged: string }> = [];
  try {
    for (const target of targets) {
      const stagedPath = join(stagingDirectory, basename(target.source));
      await fileOperations.rename(target.source, stagedPath);
      staged.push({ source: target.source, staged: stagedPath });
      const metadata = await fileOperations.lstat(stagedPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw invalid('A staged retention artifact is not a regular file.');
      }
      const checksum = createHash('sha256')
        .update(await fileOperations.readFile(stagedPath))
        .digest('hex');
      if (checksum !== target.backup.artifactSha256) {
        throw invalid('Backup inventory changed during retention staging. Generate a new preview.');
      }
    }
  } catch (error) {
    await rollbackStaging(staged, stagingDirectory, fileOperations, error);
  }

  try {
    for (const target of staged) await fileOperations.unlink(target.staged);
    await fileOperations.rmdir(stagingDirectory);
  } catch (error) {
    throw invalid(
      `Retention was applied, but purging staged files failed. Remaining files can be recovered from ${basename(stagingDirectory)}. Cause: ${errorName(error)}.`,
    );
  }
  return targets.map(({ backup }) => backup.id);
}

async function rollbackStaging(
  staged: readonly { source: string; staged: string }[],
  stagingDirectory: string,
  fileOperations: RetentionFileOperations,
  originalError: unknown,
): Promise<never> {
  try {
    for (const target of [...staged].reverse()) {
      await fileOperations.rename(target.staged, target.source);
    }
    await fileOperations.rmdir(stagingDirectory);
  } catch (rollbackError) {
    throw invalid(
      `Retention staging failed and rollback was incomplete. Inspect ${basename(stagingDirectory)} before retrying. Causes: ${errorName(originalError)}, ${errorName(rollbackError)}.`,
    );
  }
  throw invalid(`Retention staging failed; no backup was deleted. Cause: ${errorName(originalError)}.`);
}

function retentionTarget(backupDirectory: string, id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) {
    throw invalid('Retention plan contains an invalid backup id.');
  }
  const root = resolve(backupDirectory);
  const target = resolve(root, `${id}${LOCAL_BACKUP_FILE_EXTENSION}`);
  if (dirname(target) !== root || basename(target) !== `${id}${LOCAL_BACKUP_FILE_EXTENSION}`) {
    throw invalid('Retention target is outside backup storage.');
  }
  return target;
}

function retentionStagingDirectory(backupDirectory: string): string {
  const root = resolve(backupDirectory);
  const target = resolve(root, `.retention-staging-${randomUUID()}`);
  if (dirname(target) !== root) throw invalid('Retention staging path is outside backup storage.');
  return target;
}

function sameIds(left: readonly BackupSummary[], right: readonly BackupSummary[]): boolean {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id);
}

function invalid(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 400);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
