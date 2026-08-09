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
      displayName: 'Local Operator',
      email: 'user@example.org',
      id: 'user-1',
      passwordHash: await passwords.hash(password),
      roles: ['operator' as const, 'admin' as const],
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    await repository.createUser(command);
    await assert.rejects(() => repository.createUser(command), DuplicateAuthUserError);
    await assert.rejects(() => repository.createUser({
      ...command,
      displayName: '   ',
      email: 'blank-name@example.org',
      id: 'blank-name',
    }), /not normalized/u);
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
      unknown as { count: number }).count, 2);
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

test('schema v1 users migrate to a safe explicit display-name fallback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-auth-v1-test-'));
  const path = join(directory, 'auth.sqlite');
  try {
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TABLE auth_schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO auth_schema_migrations VALUES (1, '2026-01-01T00:00:00.000Z');
      CREATE TABLE auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE auth_user_roles (
        user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        PRIMARY KEY (user_id, role)
      ) STRICT;
    `);
    database.prepare(`
      INSERT INTO auth_users (id, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'legacy-user',
      'legacy@example.org',
      `scrypt$v=1$ln=10,r=8,p=1$${'a'.repeat(22)}$${'b'.repeat(43)}`,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );
    database.prepare(
      'INSERT INTO auth_user_roles (user_id, role) VALUES (?, ?)',
    ).run('legacy-user', 'operator');
    database.close();

    const repository = new SqliteAuthRepository(path);
    const migrated = await repository.findUserById('legacy-user');
    assert.equal(migrated?.displayName, 'Local User');
    assert.equal(migrated?.displayName.trim().length > 0, true);
    repository.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
