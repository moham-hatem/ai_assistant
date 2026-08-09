import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ScryptPasswordHasher } from './password.ts';
import { DuplicateAuthUserError } from './repository.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { hashSessionToken } from './token.ts';

test('SQLite migrations are ordered, idempotent, and enforce normalized security data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-auth-test-'));
  const path = join(directory, 'auth.sqlite');
  try {
    const passwords = new ScryptPasswordHasher({
      cost: 1_024,
      keyLength: 32,
      maxMemory: 4 * 1024 * 1024,
    });
    const password = 'database plaintext sentinel';
    const rawToken = 'raw-session-token-sentinel-'.padEnd(43, 'x');
    const repository = new SqliteAuthRepository(path);
    const command = {
      email: 'user@example.org',
      id: 'user-1',
      passwordHash: await passwords.hash(password),
      roles: ['operator' as const, 'admin' as const],
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    await repository.createUser(command);
    await assert.rejects(() => repository.createUser(command), DuplicateAuthUserError);
    await repository.saveSession({
      absoluteExpiresAt: '2026-01-01T02:00:00.000Z',
      createdAt: command.timestamp,
      idleExpiresAt: '2026-01-01T01:00:00.000Z',
      lastSeenAt: command.timestamp,
      revokedAt: null,
      tokenHash: hashSessionToken(rawToken),
      userId: command.id,
    });
    repository.close();

    const reopened = new SqliteAuthRepository(path);
    assert.deepEqual((await reopened.findUserByEmail(command.email))?.roles.sort(), ['admin', 'operator']);
    reopened.close();

    const bytes = readdirSync(directory)
      .map((file) => readFileSync(join(directory, file)))
      .reduce((combined, item) => Buffer.concat([combined, item]), Buffer.alloc(0));
    assert.equal(bytes.includes(Buffer.from(password)), false);
    assert.equal(bytes.includes(Buffer.from(rawToken)), false);

    const database = new DatabaseSync(path);
    assert.equal((database.prepare('SELECT count(*) AS count FROM auth_schema_migrations').get() as
      unknown as { count: number }).count, 1);
    assert.throws(() => database.prepare(`
      INSERT INTO auth_sessions (
        token_hash, user_id, created_at, last_seen_at, idle_expires_at,
        absolute_expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run('not-a-hash', 'user-1', command.timestamp, command.timestamp,
      '2026-01-01T01:00:00.000Z', '2026-01-01T02:00:00.000Z'));
    database.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
