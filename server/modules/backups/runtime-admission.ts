import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError } from '../../errors.ts';
import { syncDirectoryBestEffort } from './restore-journal.ts';

type AdmissionKind = 'maintenance' | 'runtime';

interface LeaseRecord {
  kind: AdmissionKind | 'gate';
  owner: string;
  pid: number;
  scope?: string;
  startedAt: string;
}

export interface AdmissionLease {
  release(): Promise<void>;
}

export interface RuntimeAdmissionOptions {
  adoptCurrentProcessLegacy?: boolean;
  scope?: string;
}

export function acquireRuntimeAdmission(
  backupDirectory: string,
  options: RuntimeAdmissionOptions = {},
): Promise<AdmissionLease> {
  return acquireAdmission(backupDirectory, 'runtime', options);
}

export function acquireMaintenanceAdmission(backupDirectory: string): Promise<AdmissionLease> {
  return acquireAdmission(backupDirectory, 'maintenance');
}

async function acquireAdmission(
  backupDirectory: string,
  kind: AdmissionKind,
  runtimeOptions: RuntimeAdmissionOptions = {},
): Promise<AdmissionLease> {
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const gate = await acquireGate(backupDirectory);
  try {
    await rejectIncompleteRestores(backupDirectory);
    await rejectActiveOrRemoveStale(maintenancePath(backupDirectory), 'maintenance');
    if (kind === 'maintenance') {
      await rejectRuntimeLeases(backupDirectory);
      return createOwnedLease(maintenancePath(backupDirectory), kind);
    }
    const scope = validScope(runtimeOptions.scope);
    if (runtimeOptions.adoptCurrentProcessLegacy) {
      await removeSupersededCurrentProcessLeases(backupDirectory, scope);
    }
    const owner = randomUUID();
    return createOwnedLease(join(backupDirectory, `.runtime.${owner}.lock`), kind, owner, scope);
  } finally {
    await gate.release();
  }
}

async function removeSupersededCurrentProcessLeases(
  directory: string,
  selectedScope: string | undefined,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const match = entry.isFile()
      ? entry.name.match(/^\.runtime\.([0-9a-f-]{36})\.lock$/iu)
      : null;
    if (!match) continue;
    const path = join(directory, entry.name);
    const record = await readLease(path);
    if (record.kind !== 'runtime' || record.owner.toLowerCase() !== match[1].toLowerCase()) {
      throw blocked('Legacy runtime lease ownership is invalid; refusing adoption.');
    }
    if (record.pid !== process.pid) continue;
    if (record.scope !== undefined && record.scope !== selectedScope) continue;
    const current = await readFile(path, 'utf8');
    if (current !== JSON.stringify(record)) throw blocked('Legacy runtime lease changed during adoption.');
    await rm(path);
  }
  await syncDirectoryBestEffort(directory);
}

async function acquireGate(backupDirectory: string): Promise<AdmissionLease> {
  const path = join(backupDirectory, '.admission.lock');
  try {
    return await createOwnedLease(path, 'gate');
  } catch (error) {
    if (!isExists(error)) throw error;
    const record = await readLease(path);
    if (pidIsAlive(record.pid)) {
      throw blocked('Another runtime admission decision is active. Retry shortly.');
    }
    throw blocked(
      'A stale admission gate was found. Verify no maintenance or runtime process is active, then remove .admission.lock manually.',
    );
  }
}

async function rejectActiveOrRemoveStale(
  path: string,
  kind: AdmissionKind,
  expectedOwner?: string,
): Promise<void> {
  let record: LeaseRecord;
  try { record = await readLease(path); }
  catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (record.kind !== kind) throw blocked('Admission lease contents are invalid; refusing startup.');
  if (expectedOwner && record.owner.toLowerCase() !== expectedOwner.toLowerCase()) {
    throw blocked('Admission lease filename does not match its owner; refusing startup.');
  }
  if (pidIsAlive(record.pid)) {
    throw blocked(kind === 'runtime'
      ? 'The local runtime is active. Stop it before maintenance.'
      : 'Maintenance is active. Runtime startup is blocked until it completes.');
  }
  if (kind === 'maintenance') {
    throw blocked(
      'A stale maintenance lease was found. Inspect any restore journal and complete rollback or recovery before removing .maintenance.lock manually.',
    );
  }
  const current = await readFile(path, 'utf8');
  if (current !== JSON.stringify(record)) throw blocked('Admission lease changed during stale cleanup.');
  await rm(path);
}

async function rejectRuntimeLeases(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const unknown = entries.find((entry) => (
    entry.name.toLowerCase().startsWith('.runtime')
    && !entry.isFile()
  ) || (
    entry.name.toLowerCase().startsWith('.runtime')
    && !/^\.runtime\.[0-9a-f-]{36}\.lock$/iu.test(entry.name)
  ));
  if (unknown) throw blocked(`Unknown runtime lease ${unknown.name} requires manual inspection.`);
  const names = entries
    .filter((entry) => entry.isFile() && /^\.runtime\.[0-9a-f-]{36}\.lock$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    const owner = name.slice('.runtime.'.length, -'.lock'.length);
    await rejectActiveOrRemoveStale(join(directory, name), 'runtime', owner);
  }
}

async function rejectIncompleteRestores(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.some((entry) => entry.name.startsWith('.restore-'))) {
    throw blocked(
      'An incomplete restore workspace was found. Inspect its restore journal and complete rollback or recovery before runtime startup.',
    );
  }
}

async function createOwnedLease(
  path: string,
  kind: LeaseRecord['kind'],
  selectedOwner: string = randomUUID(),
  scope?: string,
): Promise<AdmissionLease> {
  const record: LeaseRecord = {
    kind, owner: selectedOwner, pid: process.pid, scope, startedAt: new Date().toISOString(),
  };
  const contents = JSON.stringify(record);
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectoryBestEffort(dirname(path));
  let released = false;
  return {
    release: async () => {
      if (released) return;
      const current = await readFile(path, 'utf8').catch((error: unknown) => {
        if (isMissing(error)) return null;
        throw error;
      });
      if (current !== contents) throw blocked('Admission lease ownership changed; refusing to remove it.');
      await rm(path);
      await syncDirectoryBestEffort(dirname(path));
      released = true;
    },
  };
}

async function readLease(path: string): Promise<LeaseRecord> {
  const raw = await readFile(path, 'utf8');
  if (raw.length > 1_024) throw blocked('Admission lease is invalid.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw blocked('Admission lease is invalid.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw blocked('Admission lease is invalid.');
  const record = value as Record<string, unknown>;
  if (!['gate', 'maintenance', 'runtime'].includes(String(record.kind))
    || typeof record.owner !== 'string'
    || !/^[0-9a-f-]{36}$/iu.test(record.owner)
    || !Number.isSafeInteger(record.pid) || (record.pid as number) < 1
    || (record.scope !== undefined && (
      typeof record.scope !== 'string' || !/^[a-z0-9._-]{1,64}$/u.test(record.scope)
    ))
    || typeof record.startedAt !== 'string' || !canonicalTime(record.startedAt)) {
    throw blocked('Admission lease is invalid.');
  }
  return record as unknown as LeaseRecord;
}

function validScope(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!/^[a-z0-9._-]{1,64}$/u.test(value)) throw blocked('Runtime admission scope is invalid.');
  return value;
}

function pidIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') return false;
    return true;
  }
}

function maintenancePath(directory: string): string {
  return join(directory, '.maintenance.lock');
}

function canonicalTime(value: string): boolean {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isExists(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST');
}

function blocked(message: string): AppError {
  return new AppError('INVALID_REQUEST', message, 409);
}
