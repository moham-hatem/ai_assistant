import { lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BackupEntryKind } from '../../../shared/contracts/backups.ts';
import { AppError } from '../../errors.ts';
import { isSensitivePath, toArchivePath } from './path-policy.ts';
import { snapshotSqlite } from './sqlite-snapshot.ts';

export interface BackupSources {
  dataDirectory: string;
  directoryScopes: string[];
  sqliteFiles: string[];
}

export interface CollectedSnapshot {
  files: Map<string, { contents: Buffer; kind: BackupEntryKind }>;
  scopes: string[];
}

export async function collectSnapshot(sources: BackupSources, stagingDirectory: string): Promise<CollectedSnapshot> {
  const files = new Map<string, { contents: Buffer; kind: BackupEntryKind }>();
  const scopes: string[] = [];

  for (const source of sources.sqliteFiles) {
    const archivePath = toArchivePath(sources.dataDirectory, source);
    rejectSensitive(archivePath);
    if (!await isRegularFile(source)) continue;
    const staged = join(stagingDirectory, ...archivePath.split('/'));
    await mkdir(dirname(staged), { recursive: true });
    await snapshotSqlite(source, staged);
    files.set(archivePath, { contents: await readFile(staged), kind: 'sqlite' });
    scopes.push(archivePath);
  }

  for (const directory of sources.directoryScopes) {
    const scope = toArchivePath(sources.dataDirectory, directory);
    rejectSensitive(scope);
    if (!await isDirectory(directory)) continue;
    const before = files.size;
    await collectDirectory(sources.dataDirectory, directory, files);
    if (files.size > before) scopes.push(scope);
  }

  return { files, scopes };
}

async function collectDirectory(
  dataDirectory: string,
  directory: string,
  files: Map<string, { contents: Buffer; kind: BackupEntryKind }>,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const archivePath = toArchivePath(dataDirectory, path);
    if (isSensitivePath(archivePath)) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await collectDirectory(dataDirectory, path, files);
    } else if (entry.isFile()) {
      files.set(archivePath, { contents: await readFile(path), kind: 'file' });
    }
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function rejectSensitive(path: string): void {
  if (isSensitivePath(path)) {
    throw new AppError('INVALID_REQUEST', 'Sensitive paths cannot be included in local backups.', 400);
  }
}
