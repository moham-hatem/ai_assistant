import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { ScryptPasswordHasher } from './password.ts';
import { DuplicateAuthUserError } from './repository.ts';
import { AccessConflictError } from './access-repository.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { hashSessionToken } from './token.ts';

for (const scenario of [
  { name: 'row 3 only', versions: [3] },
  { name: 'a version gap', versions: [1, 3] },
  { name: 'a too-new version', versions: [1, 2, 3, 4] },
] as const) {
  test(`auth preflight rejects ${scenario.name} read-only and closes every handle`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ila-auth-preflight-'));
    const path = join(directory, 'auth.sqlite');
    const control = new DatabaseSync(path);
    control.exec(`
      CREATE TABLE auth_schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0), applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const insert = control.prepare(
      'INSERT INTO auth_schema_migrations(version, applied_at) VALUES (?, ?)',
    );
    for (const version of scenario.versions) insert.run(version, '2026-08-10T00:00:00.000Z');
    control.close();
    const before = await readFile(path);
    const child = startRejectedAuthRepository(path);
    try {
      await waitForChildSignal(child, 'rejected');
      assert.deepEqual(await readFile(path), before);
      assert.deepEqual(await readdir(directory), ['auth.sqlite']);
      const inspection = new DatabaseSync(path, { readOnly: true });
      try {
        const journal = inspection.prepare('PRAGMA journal_mode').get() as unknown as {
          journal_mode: string;
        };
        assert.equal(journal.journal_mode, 'delete');
      } finally {
        inspection.close();
      }
      const moved = join(directory, 'auth-renamed.sqlite');
      await rename(path, moved);
      await rename(moved, path);
    } finally {
      child.kill();
      if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve));
      await rm(directory, { force: true, recursive: true });
    }
  });
}

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
    const rawInvitationToken = 'raw-invitation-token-sentinel-'.padEnd(43, 'i');
    const rawRecoveryToken = 'raw-recovery-token-sentinel-'.padEnd(43, 'r');
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
    await repository.createInvitation({
      createdAt: command.timestamp,
      createdByUserId: command.id,
      displayName: 'Invited User',
      email: 'invited@example.org',
      expiresAt: '2026-01-02T00:00:00.000Z',
      id: 'invitation-1',
      roles: ['reviewer'],
      tokenHash: hashSessionToken(rawInvitationToken),
    });
    await repository.createRecovery({
      createdAt: command.timestamp,
      createdByUserId: command.id,
      expiresAt: '2026-01-01T01:00:00.000Z',
      id: 'recovery-1',
      tokenHash: hashSessionToken(rawRecoveryToken),
      userId: command.id,
    });
    repository.close();

    const reopened = new SqliteAuthRepository(path);
    assert.deepEqual((await reopened.findUserByEmail(command.email))?.roles.sort(), ['admin', 'operator']);
    assert.equal((await reopened.findUserByEmail(command.email))?.enabled, true);
    reopened.close();

    const bytes = readdirSync(directory)
      .map((file) => readFileSync(join(directory, file)))
      .reduce((combined, item) => Buffer.concat([combined, item]), Buffer.alloc(0));
    assert.equal(bytes.includes(Buffer.from(password)), false);
    assert.equal(bytes.includes(Buffer.from(rawToken)), false);
    assert.equal(bytes.includes(Buffer.from(rawInvitationToken)), false);
    assert.equal(bytes.includes(Buffer.from(rawRecoveryToken)), false);

    const database = new DatabaseSync(path);
    assert.equal((database.prepare('SELECT count(*) AS count FROM auth_schema_migrations').get() as
      unknown as { count: number }).count, 3);
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
    assert.equal(migrated?.enabled, true);
    assert.equal(migrated?.displayName.trim().length > 0, true);
    repository.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('active invitations are unique per normalized email across sequential and competing connections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ila-active-invitation-'));
  const path = join(directory, 'auth.sqlite');
  const timestamp = '2026-08-10T00:00:00.000Z';
  const repository = new SqliteAuthRepository(path);
  try {
    const passwords = new ScryptPasswordHasher({
      cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024,
    });
    await repository.createUser({
      displayName: 'Admin',
      email: 'admin@example.test',
      id: 'admin-1',
      passwordHash: await passwords.hash('concurrency test password'),
      roles: ['admin'],
      timestamp,
    });
    await repository.createInvitation(invitationRecord('sequential-1', 'retry@example.test'));
    await assert.rejects(
      repository.createInvitation(invitationRecord('sequential-2', 'retry@example.test')),
      AccessConflictError,
    );
  } finally {
    repository.close();
  }

  const results = await Promise.allSettled([
    createInvitationFromWorker(path, invitationRecord('concurrent-1', 'race@example.test')),
    createInvitationFromWorker(path, invitationRecord('concurrent-2', 'race@example.test')),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const rejected = results.find((item) => item.status === 'rejected');
  assert.match(String(rejected && rejected.status === 'rejected' && rejected.reason), /AccessConflictError/u);

  const control = new DatabaseSync(path);
  try {
    const rows = control.prepare(`
      SELECT email, count(*) AS count FROM auth_invitations
      WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?
      GROUP BY email ORDER BY email
    `).all(timestamp) as unknown as Array<{ count: number; email: string }>;
    assert.deepEqual(rows.map((row) => ({ count: row.count, email: row.email })), [
      { count: 1, email: 'race@example.test' },
      { count: 1, email: 'retry@example.test' },
    ]);
  } finally {
    control.close();
    await rm(directory, { force: true, recursive: true });
  }
});

function invitationRecord(id: string, email: string) {
  return {
    createdAt: '2026-08-10T00:00:00.000Z',
    createdByUserId: 'admin-1',
    displayName: 'Invited User',
    email,
    expiresAt: '2026-08-11T00:00:00.000Z',
    id,
    roles: ['reviewer' as const],
    tokenHash: hashSessionToken(id.padEnd(43, 'x').slice(0, 43)),
  };
}

function createInvitationFromWorker(
  path: string,
  record: ReturnType<typeof invitationRecord>,
): Promise<void> {
  const moduleUrl = new URL('./sqlite-repository.ts', import.meta.url).href;
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { SqliteAuthRepository } = await import(workerData.moduleUrl);
      const repository = new SqliteAuthRepository(workerData.path);
      try { await repository.createInvitation(workerData.record); }
      finally { repository.close(); }
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({ error: error.constructor.name }));
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, { eval: true, workerData: { moduleUrl, path, record } });
    worker.once('message', (message: { error?: string; ok?: boolean }) => {
      if (message.ok) resolve();
      else reject(new Error(message.error ?? 'Invitation worker failed.'));
    });
    worker.once('error', reject);
  });
}

function startRejectedAuthRepository(path: string) {
  const moduleUrl = new URL('./sqlite-repository.ts', import.meta.url).href;
  const source = `
    import { SqliteAuthRepository } from ${JSON.stringify(moduleUrl)};
    try {
      new SqliteAuthRepository(${JSON.stringify(path)});
      process.stdout.write('unexpected\\n');
    } catch {
      process.stdout.write('rejected\\n');
      setInterval(() => undefined, 1_000);
    }
  `;
  return spawn(process.execPath, [
    '--no-warnings', '--experimental-strip-types', '--input-type=module', '--eval', source,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function waitForChildSignal(
  child: ReturnType<typeof spawn>,
  expected: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(
      `Timed out waiting for auth preflight child. stderr=${stderr}`,
    )), 10_000);
    const finish = (operation: () => void) => {
      clearTimeout(timer);
      operation();
    };
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.includes(`${expected}\n`)) finish(resolve);
      else if (stdout.includes('unexpected\n')) finish(() => reject(
        new Error('Invalid auth migration history unexpectedly opened.'),
      ));
    });
    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code) => {
      if (!stdout.includes(`${expected}\n`)) finish(() => reject(new Error(
        `Auth preflight child exited early (${code}). stderr=${stderr}`,
      )));
    });
  });
}
