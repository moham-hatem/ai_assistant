import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  acquireTelegramSingleton,
  TelegramSingletonBusyError,
} from './singleton-admission.ts';

const execFileAsync = promisify(execFile);

test('a second Telegram poller fails fast until the owner releases its lease', async () => {
  const directory = await temporaryDirectory('exclusive');
  const first = await acquireTelegramSingleton(directory);
  try {
    await assert.rejects(acquireTelegramSingleton(directory), (error: unknown) => {
      assert.ok(error instanceof TelegramSingletonBusyError);
      assert.equal(error.code, 'TELEGRAM_POLLER_ALREADY_RUNNING');
      assert.doesNotMatch(error.message, /token|secret|\.lock/u);
      return true;
    });
    assert.deepEqual(await pollerLocks(directory), ['.telegram-poller.lock']);
  } finally {
    await first.release();
  }
  const replacement = await acquireTelegramSingleton(directory);
  await replacement.release();
  await rm(directory, { force: true, recursive: true });
});

test('simultaneous contenders produce exactly one singleton owner', async () => {
  const directory = await temporaryDirectory('race');
  try {
    const results = await Promise.allSettled([
      acquireTelegramSingleton(directory),
      acquireTelegramSingleton(directory),
    ]);
    const winners = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof acquireTelegramSingleton>>
      > => result.status === 'fulfilled',
    );
    assert.equal(winners.length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    await winners[0]?.value.release();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('a separate process receives only the sanitized busy code', async () => {
  const directory = await temporaryDirectory('child');
  const lease = await acquireTelegramSingleton(directory);
  const moduleUrl = new URL('./singleton-admission.ts', import.meta.url).href;
  const script = `
    const { acquireTelegramSingleton } = await import(${JSON.stringify(moduleUrl)});
    try {
      await acquireTelegramSingleton(${JSON.stringify(directory)});
      process.stdout.write('unexpected-acquisition');
    } catch (error) {
      process.stdout.write(String(error?.code ?? 'unknown'));
    }
  `;
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      '--experimental-transform-types', '--input-type=module', '--eval', script,
    ]);
    assert.equal(stdout, 'TELEGRAM_POLLER_ALREADY_RUNNING');
  } finally {
    await lease.release();
    await rm(directory, { force: true, recursive: true });
  }
});

test('a valid dead poller lease is adopted but a stale gate fails closed', async () => {
  const directory = await temporaryDirectory('stale');
  const stalePoller = {
    kind: 'telegram-poller',
    owner: randomUUID(),
    pid: 2_147_483_647,
    startedAt: '2026-08-11T00:00:00.000Z',
  } as const;
  await writeFile(join(directory, '.telegram-poller.lock'), JSON.stringify(stalePoller));
  const adopted = await acquireTelegramSingleton(directory);
  await adopted.release();

  const staleGate = { ...stalePoller, kind: 'telegram-poller-gate' } as const;
  await writeFile(join(directory, '.telegram-poller-admission.lock'), JSON.stringify(staleGate));
  try {
    await assert.rejects(
      acquireTelegramSingleton(directory),
      /stale Telegram polling admission gate/u,
    );
    assert.equal(
      await readFile(join(directory, '.telegram-poller-admission.lock'), 'utf8'),
      JSON.stringify(staleGate),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('malformed state fails closed and release never removes a replacement owner', async () => {
  const directory = await temporaryDirectory('ownership');
  await writeFile(join(directory, '.telegram-poller.lock'), '{invalid');
  await assert.rejects(acquireTelegramSingleton(directory), /requires manual inspection/u);
  await rm(join(directory, '.telegram-poller.lock'));

  const lease = await acquireTelegramSingleton(directory);
  const replacement = JSON.stringify({
    kind: 'telegram-poller', owner: randomUUID(), pid: process.pid,
    startedAt: new Date().toISOString(),
  });
  await writeFile(join(directory, '.telegram-poller.lock'), replacement);
  try {
    await assert.rejects(lease.release(), /ownership changed/u);
    assert.equal(await readFile(join(directory, '.telegram-poller.lock'), 'utf8'), replacement);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

async function temporaryDirectory(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `ila-telegram-singleton-${label}-`));
}

async function pollerLocks(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name === '.telegram-poller.lock');
}
