import { randomBytes } from 'node:crypto';
import { chmod, open, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const KEY_NAME = 'SECURITY_AUDIT_HMAC_KEY';
const KEY_BYTES = 32;

export interface AuditInitOptions {
  cwd?: string;
  generateKey?: () => Buffer;
  log?: (message: string) => void;
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
  const lockPath = resolve(cwd, '.env.local.audit-init.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Another audit:init process is running; refusing to modify .env.local.');
    }
    throw error;
  }
  try {
    let contents = '';
    let existed = true;
    try {
      contents = await readFile(envPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      existed = false;
    }

    const keyBytes = (options.generateKey ?? (() => randomBytes(KEY_BYTES)))();
    if (keyBytes.length < KEY_BYTES) {
      throw new Error('The generated security audit key must contain at least 32 bytes.');
    }
    const updated = replaceOrAppendKey(contents, keyBytes.toString('base64url'));

    await writeFile(envPath, updated, {
      encoding: 'utf8', flag: existed ? 'w' : 'wx', mode: 0o600,
    });
    try {
      await chmod(envPath, 0o600);
    } catch (error) {
      if (process.platform !== 'win32') throw error;
    }
    (options.log ?? console.log)(`Initialized ${KEY_NAME} in .env.local. The key was not printed.`);
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(lockPath, { force: true });
    }
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
