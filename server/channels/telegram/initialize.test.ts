import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeTelegramSecret } from './initialize.ts';

const knownSecret = Buffer.alloc(32, 7);

test('telegram:init adds a generated secret without printing it', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'telegram-init-'));
  const logs: string[] = [];
  try {
    await writeFile(join(cwd, '.env.local'), 'OPENCODE_API_KEY=local\r\n');
    await initializeTelegramSecret({ cwd, generateSecret: () => knownSecret, log: (line) => logs.push(line) });
    const contents = await readFile(join(cwd, '.env.local'), 'utf8');
    assert.equal(contents, `OPENCODE_API_KEY=local\r\nTELEGRAM_SESSION_SECRET=${knownSecret.toString('base64url')}\r\n`);
    assert.equal(logs.some((line) => line.includes(knownSecret.toString('base64url'))), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('telegram:init fills an empty assignment and refuses overwrite or duplicates', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'telegram-init-existing-'));
  const envPath = join(cwd, '.env.local');
  try {
    await writeFile(envPath, 'TELEGRAM_SESSION_SECRET=\n');
    await initializeTelegramSecret({ cwd, generateSecret: () => knownSecret, log: () => undefined });
    await assert.rejects(
      initializeTelegramSecret({ cwd, generateSecret: () => knownSecret, log: () => undefined }),
      /already configured/u,
    );
    await writeFile(envPath, 'TELEGRAM_SESSION_SECRET=\nTELEGRAM_SESSION_SECRET=\n');
    await assert.rejects(
      initializeTelegramSecret({ cwd, generateSecret: () => knownSecret, log: () => undefined }),
      /more than once/u,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
