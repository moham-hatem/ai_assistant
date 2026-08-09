import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { TelegramStore } from './store.ts';

const secret = 'isolated-session-secret-material-123456';

test('migrations survive restart while storing only an HMAC session key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'telegram-store-'));
  const path = join(directory, 'telegram.sqlite');
  const chatId = 123456789;
  try {
    const first = new TelegramStore(path, secret);
    const sessionKey = first.sessionKey(chatId);
    assert.equal(sessionKey.length, 64);
    assert.notEqual(sessionKey, String(chatId));
    first.setLanguage(sessionKey, 'sw');
    first.close();

    const second = new TelegramStore(path, secret);
    assert.equal(second.getLanguage(sessionKey), 'sw');
    second.close();

    const database = new DatabaseSync(path);
    const version = database.prepare('PRAGMA user_version').get() as unknown as { user_version: number };
    const columns = database.prepare('PRAGMA table_info(telegram_sessions)').all() as unknown as Array<{ name: string }>;
    const row = database.prepare('SELECT * FROM telegram_sessions').get() as unknown as Record<string, unknown>;
    database.close();
    assert.equal(version.user_version, 1);
    assert.deepEqual(columns.map((column) => column.name), ['session_key', 'language', 'updated_at']);
    assert.equal(Object.values(row).includes(chatId), false);
    assert.equal(Object.values(row).includes(String(chatId)), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('atomic claims suppress duplicates and expired or released leases can retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'telegram-claims-'));
  const path = join(directory, 'telegram.sqlite');
  let now = 1_000;
  const first = new TelegramStore(path, secret, () => now);
  const second = new TelegramStore(path, secret, () => now);
  try {
    assert.equal(first.claimUpdate(10, 500), 'claimed');
    assert.equal(second.claimUpdate(10, 500), 'busy');
    now = 1_501;
    assert.equal(second.claimUpdate(10, 500), 'claimed');
    second.releaseUpdate(10);
    assert.equal(first.claimUpdate(10, 500), 'claimed');
    first.completeUpdate(10);
    assert.equal(second.claimUpdate(10, 500), 'completed');

    const database = new DatabaseSync(path, { readOnly: true });
    const row = database.prepare(
      'SELECT status, lease_until, attempts FROM telegram_updates WHERE update_id = 10',
    ).get() as unknown as { attempts: number; lease_until: null; status: string };
    database.close();
    assert.equal(row.status, 'completed');
    assert.equal(row.lease_until, null);
    assert.equal(row.attempts, 3);
  } finally {
    first.close();
    second.close();
    await rm(directory, { recursive: true, force: true });
  }
});
