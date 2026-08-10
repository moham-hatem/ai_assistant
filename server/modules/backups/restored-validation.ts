import { lstat, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { AppError } from '../../errors.ts';
import { sha256, type DecodedBackup } from './archive-codec.ts';
import { resolveArchivePath } from './path-policy.ts';

export interface RestoredValidationReport {
  checkedDatabases: number;
  checkedFiles: number;
}

export async function validateRestoredSnapshot(
  dataDirectory: string,
  backup: DecodedBackup,
): Promise<RestoredValidationReport> {
  let checkedDatabases = 0;
  for (const entry of backup.manifest.files) {
    const path = resolveArchivePath(dataDirectory, entry.path);
    const metadata = await safeStat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) invalid('A restored entry is not a regular file.');
    const contents = await readFile(path);
    if (contents.length !== entry.size || sha256(contents) !== entry.sha256) {
      invalid('Restored file checksum validation failed.');
    }
    if (entry.kind === 'sqlite') {
      checkSqlite(path);
      checkedDatabases += 1;
    }
  }
  return { checkedDatabases, checkedFiles: backup.manifest.fileCount };
}

function checkSqlite(path: string): void {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const result = database.prepare('PRAGMA quick_check').get() as { quick_check?: string };
    if (result.quick_check !== 'ok') invalid('A restored SQLite database failed its integrity check.');
  } catch (error) {
    if (error instanceof AppError) throw error;
    invalid('A restored SQLite database could not be verified.');
  } finally {
    database?.close();
  }
}

async function safeStat(path: string) {
  try { return await lstat(path); }
  catch { return invalid('A restored file is missing or unreadable.'); }
}

function invalid(message: string): never {
  throw new AppError('INVALID_REQUEST', message, 422);
}
