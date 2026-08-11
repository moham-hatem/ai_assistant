import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  TELEGRAM_RUNTIME_STATES,
  TELEGRAM_SAFE_ERROR_CODES,
  type TelegramRuntimeState,
  type TelegramSafeErrorCode,
} from '../../../shared/contracts/system-diagnostics.ts';

const maximumSnapshotBytes = 8_192;
export const DEFAULT_TELEGRAM_RUNTIME_STATUS_TTL_MS = 90_000;

export interface TelegramRuntimeStatusSnapshot {
  configured: boolean;
  errorCode?: TelegramSafeErrorCode;
  lastHandledUpdateAt?: string;
  lastSuccessfulPoll?: string;
  publicLink?: string;
  publicUsername?: string;
  retryCount: number;
  state: TelegramRuntimeState;
  updatedAt: string;
  version: 1;
}

export type TelegramRuntimeStatusRead =
  | { kind: 'available'; snapshot: TelegramRuntimeStatusSnapshot }
  | { kind: 'stale'; snapshot: TelegramRuntimeStatusSnapshot }
  | { kind: 'invalid' }
  | { kind: 'missing' };

export interface TelegramRuntimeStatusUpdate {
  configured: boolean;
  errorCode?: TelegramSafeErrorCode;
  lastHandledUpdateAt?: string;
  lastSuccessfulPoll?: string;
  publicUsername?: string;
  retryCount: number;
  state: TelegramRuntimeState;
  updatedAt?: string;
}

export function resolveTelegramRuntimeStatusPath(
  env: Record<string, string | undefined>,
  cwd: string,
): string {
  return resolve(cwd, env.TELEGRAM_RUNTIME_STATUS_FILE?.trim() || 'data/telegram-runtime-status.json');
}

export async function writeTelegramRuntimeStatus(
  path: string,
  update: TelegramRuntimeStatusUpdate,
): Promise<void> {
  const snapshot = normalizeUpdate(update);
  const directory = dirname(path);
  const temporary = resolve(directory, `.telegram-runtime-status.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(snapshot), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    await syncDirectoryBestEffort(directory);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readTelegramRuntimeStatus(
  path: string,
  options: { now?: () => number; ttlMs?: number } = {},
): Promise<TelegramRuntimeStatusRead> {
  const ttlMs = boundedTtl(options.ttlMs ?? DEFAULT_TELEGRAM_RUNTIME_STATUS_TTL_MS);
  let handle;
  try {
    handle = await open(path, 'r');
  } catch (error) {
    if (isMissing(error)) return { kind: 'missing' };
    return { kind: 'invalid' };
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maximumSnapshotBytes) return { kind: 'invalid' };
    const raw = await handle.readFile('utf8');
    const snapshot = parseSnapshot(raw);
    if (!snapshot) return { kind: 'invalid' };
    const age = (options.now ?? Date.now)() - Date.parse(snapshot.updatedAt);
    return age < 0 || age > ttlMs ? { kind: 'stale', snapshot } : { kind: 'available', snapshot };
  } catch {
    return { kind: 'invalid' };
  } finally {
    await handle.close();
  }
}

function normalizeUpdate(update: TelegramRuntimeStatusUpdate): TelegramRuntimeStatusSnapshot {
  const username = update.publicUsername === undefined ? undefined : validUsername(update.publicUsername);
  const candidate = {
    configured: update.configured,
    ...(update.errorCode === undefined ? {} : { errorCode: update.errorCode }),
    ...(update.lastHandledUpdateAt === undefined ? {} : { lastHandledUpdateAt: update.lastHandledUpdateAt }),
    ...(update.lastSuccessfulPoll === undefined ? {} : { lastSuccessfulPoll: update.lastSuccessfulPoll }),
    ...(username === undefined ? {} : { publicLink: `https://t.me/${username}`, publicUsername: username }),
    retryCount: update.retryCount,
    state: update.state,
    updatedAt: update.updatedAt ?? new Date().toISOString(),
    version: 1 as const,
  };
  const parsed = parseSnapshot(JSON.stringify(candidate));
  if (!parsed) throw new Error('Telegram runtime status update is invalid.');
  return parsed;
}

function parseSnapshot(raw: string): TelegramRuntimeStatusSnapshot | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'configured', 'errorCode', 'lastHandledUpdateAt', 'lastSuccessfulPoll', 'publicLink',
    'publicUsername', 'retryCount', 'state', 'updatedAt', 'version',
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key))
    || record.version !== 1
    || typeof record.configured !== 'boolean'
    || !TELEGRAM_RUNTIME_STATES.includes(record.state as TelegramRuntimeState)
    || !safeInteger(record.retryCount)
    || !timestamp(record.updatedAt)) return null;
  if (record.errorCode !== undefined
    && !TELEGRAM_SAFE_ERROR_CODES.includes(record.errorCode as TelegramSafeErrorCode)) return null;
  if (record.lastHandledUpdateAt !== undefined && !timestamp(record.lastHandledUpdateAt)) return null;
  if (record.lastSuccessfulPoll !== undefined && !timestamp(record.lastSuccessfulPoll)) return null;
  const username = record.publicUsername;
  const link = record.publicLink;
  if ((username === undefined) !== (link === undefined)) return null;
  if (username !== undefined && (
    typeof username !== 'string'
    || !usernamePattern.test(username)
    || link !== `https://t.me/${username}`
  )) return null;
  if (record.state === 'running' && (!record.configured || record.errorCode !== undefined)) return null;
  if (record.state === 'degraded' && record.errorCode === undefined) return null;
  return record as unknown as TelegramRuntimeStatusSnapshot;
}

const usernamePattern = /^[A-Za-z][A-Za-z0-9_]{4,31}$/u;

function validUsername(value: string): string {
  if (!usernamePattern.test(value)) throw new Error('Telegram public username is invalid.');
  return value;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function safeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000;
}

function boundedTtl(value: number): number {
  if (!Number.isSafeInteger(value) || value < 5_000 || value > 86_400_000) {
    throw new Error('Telegram runtime status TTL is invalid.');
  }
  return value;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

async function syncDirectoryBestEffort(path: string): Promise<void> {
  try {
    const handle = await open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error)
      || !['EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(String(error.code))) throw error;
  }
}
