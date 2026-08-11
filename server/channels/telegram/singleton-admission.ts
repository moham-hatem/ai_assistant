import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { syncDirectoryBestEffort } from '../../modules/backups/restore-journal.ts';

const gateName = '.telegram-poller-admission.lock';
const leaseName = '.telegram-poller.lock';

interface TelegramLeaseRecord {
  kind: 'telegram-poller' | 'telegram-poller-gate';
  owner: string;
  pid: number;
  startedAt: string;
}

export interface TelegramSingletonLease {
  release(): Promise<void>;
}

export class TelegramSingletonBusyError extends Error {
  readonly code = 'TELEGRAM_POLLER_ALREADY_RUNNING';

  constructor(message = 'Telegram polling is already active.') {
    super(message);
    this.name = 'TelegramSingletonBusyError';
  }
}

/**
 * Serializes one Telegram poller independently from the general runtime admission lock.
 * A dead poller lease is removed under a short-lived gate because it protects no data
 * transition. A dead or malformed gate fails closed and requires manual inspection.
 */
export async function acquireTelegramSingleton(
  backupDirectory: string,
): Promise<TelegramSingletonLease> {
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const gate = await acquireGate(backupDirectory);
  let primaryError: unknown;
  let result: TelegramSingletonLease | undefined;
  try {
    await rejectActiveOrRemoveStale(join(backupDirectory, leaseName), backupDirectory);
    result = await createOwnedLease(
      join(backupDirectory, leaseName),
      backupDirectory,
      'telegram-poller',
    );
  } catch (error) {
    primaryError = error;
  }
  try {
    await gate.release();
  } catch (releaseError) {
    const cleanupErrors: unknown[] = [];
    if (result) {
      try { await result.release(); }
      catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    if (primaryError !== undefined) {
      throw new AggregateError(
        [primaryError, releaseError, ...cleanupErrors],
        'Telegram polling admission failed and its gate could not be released.',
        { cause: primaryError },
      );
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [releaseError, ...cleanupErrors],
        'Telegram polling admission cleanup failed.',
        { cause: releaseError },
      );
    }
    throw releaseError;
  }
  if (primaryError !== undefined) throw primaryError;
  if (!result) throw new Error('Telegram polling admission did not produce a lease.');
  return result;
}

async function acquireGate(directory: string): Promise<TelegramSingletonLease> {
  const path = join(directory, gateName);
  try {
    return await createOwnedLease(path, directory, 'telegram-poller-gate');
  } catch (error) {
    if (!isExists(error)) throw error;
    const record = await readLease(path);
    if (record.kind !== 'telegram-poller-gate') throw invalidLease();
    if (pidIsAlive(record.pid)) {
      throw new TelegramSingletonBusyError('Another Telegram polling admission decision is active.');
    }
    throw new TelegramSingletonBusyError(
      'A stale Telegram polling admission gate requires manual inspection.',
    );
  }
}

async function rejectActiveOrRemoveStale(path: string, directory: string): Promise<void> {
  let record: TelegramLeaseRecord;
  try {
    record = await readLease(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (record.kind !== 'telegram-poller') throw invalidLease();
  if (pidIsAlive(record.pid)) throw new TelegramSingletonBusyError();
  const expected = JSON.stringify(record);
  if (await readFile(path, 'utf8') !== expected) throw invalidLease();
  await rm(path);
  await syncDirectoryBestEffort(directory);
}

async function createOwnedLease(
  path: string,
  directory: string,
  kind: TelegramLeaseRecord['kind'],
): Promise<TelegramSingletonLease> {
  const record: TelegramLeaseRecord = {
    kind,
    owner: randomUUID(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const contents = JSON.stringify(record);
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectoryBestEffort(directory);
  let released = false;
  return {
    release: async () => {
      if (released) return;
      let current: string;
      try { current = await readFile(path, 'utf8'); }
      catch (error) {
        if (isMissing(error)) throw ownershipChanged();
        throw error;
      }
      if (current !== contents) throw ownershipChanged();
      await rm(path);
      await syncDirectoryBestEffort(directory);
      released = true;
    },
  };
}

async function readLease(path: string): Promise<TelegramLeaseRecord> {
  const contents = await readFile(path, 'utf8');
  let value: unknown;
  try { value = JSON.parse(contents); }
  catch { throw invalidLease(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidLease();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'kind,owner,pid,startedAt'
    || (record.kind !== 'telegram-poller' && record.kind !== 'telegram-poller-gate')
    || typeof record.owner !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.owner)
    || !Number.isSafeInteger(record.pid) || (record.pid as number) <= 0
    || typeof record.startedAt !== 'string' || !Number.isFinite(Date.parse(record.startedAt))) {
    throw invalidLease();
  }
  return record as unknown as TelegramLeaseRecord;
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function invalidLease(): TelegramSingletonBusyError {
  return new TelegramSingletonBusyError(
    'Telegram polling admission state is invalid and requires manual inspection.',
  );
}

function ownershipChanged(): TelegramSingletonBusyError {
  return new TelegramSingletonBusyError(
    'Telegram polling lease ownership changed; refusing to remove it.',
  );
}

function isExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'EEXIST';
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
