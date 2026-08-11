import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readTelegramRuntimeStatus,
  writeTelegramRuntimeStatus,
} from './runtime-status.ts';

test('Telegram runtime status writes and reads a safe atomic public snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-telegram-status-'));
  const path = join(root, 'status.json');
  try {
    await writeTelegramRuntimeStatus(path, {
      configured: true,
      lastHandledUpdateAt: '2026-08-11T10:00:01.000Z',
      lastSuccessfulPoll: '2026-08-11T10:00:02.000Z',
      publicUsername: 'LearningHelperBot',
      retryCount: 0,
      state: 'running',
      updatedAt: '2026-08-11T10:00:03.000Z',
    });
    const result = await readTelegramRuntimeStatus(path, {
      now: () => Date.parse('2026-08-11T10:00:04.000Z'), ttlMs: 60_000,
    });
    assert.equal(result.kind, 'available');
    assert.equal(result.kind === 'available' && result.snapshot.publicLink, 'https://t.me/LearningHelperBot');
    assert.equal(JSON.stringify(result).includes('token'), false);
    assert.deepEqual((await readdir(root)).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('Telegram runtime status distinguishes stale, missing, and invalid snapshots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-telegram-status-state-'));
  const path = join(root, 'status.json');
  try {
    assert.deepEqual(await readTelegramRuntimeStatus(path), { kind: 'missing' });
    await writeTelegramRuntimeStatus(path, {
      configured: true,
      errorCode: 'network_unavailable',
      retryCount: 3,
      state: 'degraded',
      updatedAt: '2026-08-11T10:00:00.000Z',
    });
    assert.equal((await readTelegramRuntimeStatus(path, {
      now: () => Date.parse('2026-08-11T10:02:00.000Z'), ttlMs: 60_000,
    })).kind, 'stale');
    await writeFile(path, JSON.stringify({ token: 'forbidden' }));
    assert.deepEqual(await readTelegramRuntimeStatus(path), { kind: 'invalid' });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('Telegram runtime status rejects arbitrary links, raw errors, and contradictory states', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-telegram-status-safe-'));
  const path = join(root, 'status.json');
  try {
    await assert.rejects(writeTelegramRuntimeStatus(path, {
      configured: true, retryCount: 0, state: 'running', publicUsername: 'https://evil.example',
    }));
    await assert.rejects(writeTelegramRuntimeStatus(path, {
      configured: true, errorCode: 'network_unavailable', retryCount: 1, state: 'running',
    }));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
