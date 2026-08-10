import { randomBytes, randomUUID } from 'node:crypto';
import {
  chmod,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  type FileHandle,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEY_NAME = 'SECURITY_AUDIT_HMAC_KEY';
const KEY_BYTES = 32;
const DEFAULT_STALE_LOCK_MS = 10 * 60_000;
export const WINDOWS_ACL_WARNING =
  'WARNING: Windows ACLs were not verified; manually restrict .env.local to your account.';
export const WINDOWS_DIRECTORY_SYNC_WARNING =
  'WARNING: Windows directory metadata fsync is unavailable; verify .env.local exists securely.';

export interface AuditInitOptions {
  cwd?: string;
  afterLockCreated?: () => Promise<void>;
  generateKey?: () => Buffer;
  log?: (message: string) => void;
  now?: () => number;
  platform?: NodeJS.Platform;
  renameFile?: (source: string, destination: string) => Promise<void>;
  staleLockMs?: number;
  syncDirectory?: (directory: string) => Promise<void>;
  warn?: (message: string) => void;
  writeTemp?: (handle: FileHandle, contents: string) => Promise<void>;
}

function isEmptyEnvValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === "''" || trimmed === '""' || trimmed.startsWith('#');
}

function replaceOrAppendKey(contents: string, key: string): string {
  const hadBom = contents.startsWith('\uFEFF');
  const body = hadBom ? contents.slice(1) : contents;
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/u);
  const assignment = /^\s*(?:export\s+)?SECURITY_AUDIT_HMAC_KEY\s*=(.*)$/u;
  const matches = lines.flatMap((line, index) => {
    const match = assignment.exec(line);
    return match ? [{ index, value: match[1] }] : [];
  });

  if (matches.length > 1) {
    throw new Error(`${KEY_NAME} is declared more than once in .env.local; refusing to choose a value.`);
  }
  if (matches.length === 1 && !isEmptyEnvValue(matches[0].value)) {
    throw new Error(`${KEY_NAME} is already set in .env.local; refusing to overwrite it.`);
  }

  if (matches.length === 1) {
    lines[matches[0].index] = `${KEY_NAME}=${key}`;
  } else {
    if (lines.length === 1 && lines[0] === '') lines.pop();
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    lines.push(`${KEY_NAME}=${key}`, '');
  }
  return `${hadBom ? '\uFEFF' : ''}${lines.join(newline)}`;
}

export async function initializeSecurityAuditKey(options: AuditInitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const envPath = resolve(cwd, '.env.local');
  const lockPath = await acquireLock(
    cwd,
    options.staleLockMs ?? DEFAULT_STALE_LOCK_MS,
    options.now ?? Date.now,
    options.afterLockCreated,
  );
  const tempPath = resolve(cwd, `.env.local.audit-init.${process.pid}.${randomUUID()}.tmp`);
  let tempHandle: FileHandle | undefined;
  let replaced = false;
  try {
    let contents = '';
    try {
      contents = await readFile(envPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const keyBytes = (options.generateKey ?? (() => randomBytes(KEY_BYTES)))();
    if (keyBytes.length < KEY_BYTES) {
      throw new Error('The generated security audit key must contain at least 32 bytes.');
    }
    const updated = replaceOrAppendKey(contents, keyBytes.toString('base64url'));

    tempHandle = await open(tempPath, 'wx', 0o600);
    await (options.writeTemp ?? writeAndSync)(tempHandle, updated);
    await tempHandle.close();
    tempHandle = undefined;
    const platform = options.platform ?? process.platform;
    if (platform === 'win32') {
      (options.warn ?? console.warn)(WINDOWS_ACL_WARNING);
    } else {
      await chmod(tempPath, 0o600);
    }
    await (options.renameFile ?? rename)(tempPath, envPath);
    replaced = true;
    if (options.syncDirectory) {
      await options.syncDirectory(cwd);
    } else if (platform === 'win32') {
      (options.warn ?? console.warn)(WINDOWS_DIRECTORY_SYNC_WARNING);
    } else {
      await syncDirectoryMetadata(cwd);
    }
    (options.log ?? console.log)(`Initialized ${KEY_NAME} in .env.local. The key was not printed.`);
  } finally {
    try {
      if (tempHandle) await tempHandle.close();
    } finally {
      try {
        if (!replaced) await rm(tempPath, { force: true });
      } finally {
        await rm(lockPath, { force: true });
      }
    }
  }
}

async function acquireLock(
  directory: string,
  staleLockMs: number,
  now: () => number,
  afterCreated?: () => Promise<void>,
): Promise<string> {
  if (!Number.isSafeInteger(staleLockMs) || staleLockMs < 1) {
    throw new Error('The stale audit:init lock timeout must be a positive integer.');
  }
  const prefix = '.env.local.audit-init.lock';
  const ownerPath = resolve(directory, `${prefix}.${randomUUID()}`);
  const owner = await open(ownerPath, 'wx', 0o600);
  try {
    await owner.writeFile(`${process.pid}\n`, 'utf8');
    await owner.sync();
  } finally {
    await owner.close();
  }
  try {
    if (afterCreated) await afterCreated();
    const ownStat = await stat(ownerPath, { bigint: true });
    for (const name of await readdir(directory)) {
      if (name !== prefix && !name.startsWith(`${prefix}.`)) continue;
      const candidate = resolve(directory, name);
      if (candidate === ownerPath) continue;
      let candidateStat;
      try {
        candidateStat = await stat(candidate, { bigint: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const ageMs = now() - Number(candidateStat.mtimeNs / 1_000_000n);
      if (ageMs > staleLockMs) {
        await rm(candidate, { force: true });
        continue;
      }
      if (candidateStat.birthtimeNs <= ownStat.birthtimeNs) {
        throw new Error('Another audit:init process is running; refusing to modify .env.local.');
      }
    }
    return ownerPath;
  } catch (error) {
    await rm(ownerPath, { force: true });
    throw error;
  }
}

async function writeAndSync(handle: FileHandle, contents: string): Promise<void> {
  await handle.writeFile(contents, { encoding: 'utf8' });
  await handle.sync();
}

async function syncDirectoryMetadata(directory: string): Promise<void> {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  try {
    await initializeSecurityAuditKey();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    console.error(`audit:init failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
