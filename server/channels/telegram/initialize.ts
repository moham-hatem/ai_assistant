import { randomBytes, randomUUID } from 'node:crypto';
import { open, readFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const keyName = 'TELEGRAM_SESSION_SECRET';

export interface TelegramInitializeOptions {
  cwd?: string;
  generateSecret?: () => Buffer;
  log?: (message: string) => void;
}

export async function initializeTelegramSecret(
  options: TelegramInitializeOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const envPath = resolve(cwd, '.env.local');
  const lockPath = resolve(cwd, '.env.local.telegram-init.lock');
  const temporaryPath = resolve(cwd, `.env.local.telegram-init.${randomUUID()}.tmp`);
  const lock = await open(lockPath, 'wx', 0o600).catch((error: unknown) => {
    if (hasCode(error, 'EEXIST')) {
      throw new Error('Another telegram:init process or an unresolved lock exists.');
    }
    throw error;
  });
  await lock.close();
  let replaced = false;
  try {
    const current = await readFile(envPath, 'utf8').catch((error: unknown) => {
      if (hasCode(error, 'ENOENT')) return '';
      throw error;
    });
    const secret = (options.generateSecret ?? (() => randomBytes(32)))();
    if (secret.length < 32) throw new Error('Telegram session secret must contain 32 random bytes.');
    const updated = replaceEmptyAssignment(current, secret.toString('base64url'));
    const temporary = await open(temporaryPath, 'wx', 0o600);
    try {
      await temporary.writeFile(updated, 'utf8');
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, envPath);
    replaced = true;
    (options.log ?? console.log)(`Initialized ${keyName} in .env.local. The secret was not printed.`);
  } finally {
    if (!replaced) await rm(temporaryPath, { force: true });
    await rm(lockPath, { force: true });
  }
}

function replaceEmptyAssignment(contents: string, secret: string): string {
  const hadBom = contents.startsWith('\uFEFF');
  const body = hadBom ? contents.slice(1) : contents;
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/u);
  const assignment = /^\s*(?:export\s+)?TELEGRAM_SESSION_SECRET\s*=(.*)$/u;
  const matches = lines.flatMap((line, index) => {
    const match = assignment.exec(line);
    return match ? [{ index, value: match[1].trim() }] : [];
  });
  if (matches.length > 1) throw new Error(`${keyName} is declared more than once.`);
  if (matches[0] && !['', "''", '\"\"'].includes(matches[0].value)) {
    throw new Error(`${keyName} is already configured; refusing to overwrite it.`);
  }
  if (matches[0]) {
    lines[matches[0].index] = `${keyName}=${secret}`;
  } else {
    while (lines.at(-1) === '') lines.pop();
    lines.push(`${keyName}=${secret}`, '');
  }
  return `${hadBom ? '\uFEFF' : ''}${lines.join(newline)}`;
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
