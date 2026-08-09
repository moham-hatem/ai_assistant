import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import { SecurityAuditValidationError, type SecurityAuditCommand } from './domain.ts';
import { SecurityAuditService } from './service.ts';
import { SqliteSecurityAuditRepository } from './sqlite-repository.ts';

const key = randomBytes(32);

for (const scenario of [
  { name: 'row 3 only', versions: [3], message: /contiguous from version 1/u },
  { name: 'a version gap', versions: [1, 3], message: /contiguous from version 1/u },
  { name: 'a too-new version', versions: [1, 2, 3, 4], message: /newer than supported/u },
] as const) {
  test(`migration history rejects ${scenario.name} before schema mutation`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'security-audit-migrations-'));
    const path = join(directory, 'audit.sqlite');
    const control = new DatabaseSync(path);
    control.exec(`
      CREATE TABLE security_audit_schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0), applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const insert = control.prepare(
      'INSERT INTO security_audit_schema_migrations(version, applied_at) VALUES (?, ?)',
    );
    for (const version of scenario.versions) insert.run(version, '2026-08-10T00:00:00.000Z');
    control.close();
    const before = await readFile(path);
    try {
      assert.throws(
        () => new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1'),
        scenario.message,
      );
      assert.deepEqual(await readFile(path), before);
      const reopened = new DatabaseSync(path);
      try {
        const tables = reopened.prepare(`
          SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
        `).all() as unknown as Array<{ name: string }>;
        assert.deepEqual(tables.map((item) => item.name), ['security_audit_schema_migrations']);
        const versions = reopened.prepare(`
          SELECT version FROM security_audit_schema_migrations ORDER BY version
        `).all() as unknown as Array<{ version: number }>;
        assert.deepEqual(versions.map((item) => item.version), [...scenario.versions]);
      } finally {
        reopened.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('appends an HMAC chain, filters minimized events, and rejects content metadata', async () => {
  const repository = new SqliteSecurityAuditRepository(':memory:', new Map([['v1', key]]), 'v1');
  const service = new SecurityAuditService(repository);
  try {
    await service.record(event({ action: 'auth.login', category: 'authentication', metadata: { reason: 'valid_credentials' } }));
    await service.record(event({ action: 'book.edition_published', category: 'books', metadata: { fromStatus: 'ready' } }));
    const page = await service.list({ category: 'books', limit: 10, offset: 0 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.previousHash.length, 64);
    assert.equal((await service.verifyIntegrity()).status, 'valid');
    await assert.rejects(
      () => service.record(event({ action: 'auth.login', category: 'authentication', metadata: { password: 'never' } as never })),
      SecurityAuditValidationError,
    );
    assert.equal(JSON.stringify(page).includes('never'), false);
  } finally { repository.close(); }
});

test('integrity verification detects database tampering and reports missing historical keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-test-'));
  const path = join(directory, 'audit.sqlite');
  const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  await repository.append(event({ action: 'auth.logout', category: 'authentication' }));
  repository.close();
  const control = new DatabaseSync(path);
  control.exec('DROP TRIGGER security_audit_no_update;');
  control.prepare("UPDATE security_audit_events SET request_id = 'tampered' WHERE sequence = 1").run();
  control.close();
  const tampered = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  try {
    const summary = await tampered.verifyIntegrity(new Date().toISOString());
    assert.equal(summary.status, 'invalid');
    assert.equal(summary.firstInvalidSequence, 1);
  } finally {
    tampered.close();
  }
  const missingKey = new SqliteSecurityAuditRepository(path, new Map([['v2', randomBytes(32)]]), 'v2');
  try {
    assert.equal((await missingKey.verifyIntegrity(new Date().toISOString())).status, 'unverifiable');
  } finally {
    missingKey.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('v1 migration rolls back before schema mutation when the same key version has the wrong key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-v1-wrong-key-'));
  const path = join(directory, 'audit.sqlite');
  const correctKey = randomBytes(32);
  const repository = new SqliteSecurityAuditRepository(
    path, new Map([['v1', correctKey]]), 'v1',
  );
  await repository.append(event());
  repository.close();
  downgradeToV1(path);

  try {
    assert.throws(
      () => new SqliteSecurityAuditRepository(
        path, new Map([['v1', randomBytes(32)]]), 'v1',
      ),
      /history is invalid/u,
    );
    assertV1Shape(path);

    const recovered = new SqliteSecurityAuditRepository(
      path, new Map([['v1', correctKey]]), 'v1',
    );
    try {
      assert.equal((await recovered.verifyIntegrity(new Date().toISOString())).status, 'valid');
    } finally {
      recovered.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v1 migration requires every historical key and accepts valid key rotation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-v1-rotation-'));
  const path = join(directory, 'audit.sqlite');
  const v1 = randomBytes(32);
  const v2 = randomBytes(32);
  let repository = new SqliteSecurityAuditRepository(path, new Map([['v1', v1]]), 'v1');
  await repository.append(event());
  repository.close();
  repository = new SqliteSecurityAuditRepository(
    path, new Map([['v1', v1], ['v2', v2]]), 'v2',
  );
  await repository.append(event());
  repository.close();
  downgradeToV1(path);

  try {
    assert.throws(
      () => new SqliteSecurityAuditRepository(path, new Map([['v2', v2]]), 'v2'),
      /historical key is unavailable: v1/u,
    );
    assertV1Shape(path);

    const recovered = new SqliteSecurityAuditRepository(
      path, new Map([['v1', v1], ['v2', v2]]), 'v2',
    );
    try {
      const integrity = await recovered.verifyIntegrity(new Date().toISOString());
      assert.equal(integrity.status, 'valid');
      assert.deepEqual(integrity.keyVersions, ['v1', 'v2']);
    } finally {
      recovered.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v2 migration preserves the authenticated history and admits access lifecycle events', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-v2-access-'));
  const path = join(directory, 'audit.sqlite');
  const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  await repository.append(event({ requestId: 'before-v3' }));
  repository.close();
  downgradeToV2(path);

  const migrated = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  try {
    assert.equal((await migrated.verifyIntegrity(new Date().toISOString())).status, 'valid');
    await migrated.append(event({
      action: 'access.user_disabled',
      category: 'access',
      metadata: {},
      requestId: 'after-v3',
      subjectId: 'user-1',
      subjectType: 'user',
    }));
    const page = await migrated.list({ limit: 10, offset: 0 });
    assert.equal(page.total, 2);
    assert.equal((await migrated.verifyIntegrity(new Date().toISOString())).status, 'valid');
  } finally {
    migrated.close();
    assertSchemaVersion(path, 3);
    await rm(directory, { recursive: true, force: true });
  }
});

test('v3 migration validates the authenticated head and rolls back before schema replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-v3-head-'));
  const path = join(directory, 'audit.sqlite');
  const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  await repository.append(event());
  repository.close();
  downgradeToV2(path);
  const control = new DatabaseSync(path);
  control.prepare('UPDATE security_audit_head SET event_count = 2 WHERE singleton = 1').run();
  control.close();
  try {
    assert.throws(
      () => new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1'),
      /authenticated head is invalid/u,
    );
    assertSchemaVersion(path, 2);
    const database = new DatabaseSync(path);
    try {
      const schema = database.prepare(`
        SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'security_audit_events'
      `).get() as unknown as { sql: string };
      assert.equal(schema.sql.includes('access.user_disabled'), false);
    } finally {
      database.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const deletion of ['tail', 'all'] as const) {
  test(`authenticated local head detects ${deletion} event deletion`, async () => {
    const directory = await mkdtemp(join(tmpdir(), `security-audit-${deletion}-`));
    const path = join(directory, 'audit.sqlite');
    const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
    await repository.append(event());
    await repository.append(event());
    repository.close();
    const control = new DatabaseSync(path);
    control.exec('DROP TRIGGER security_audit_no_delete;');
    control.exec(deletion === 'tail'
      ? 'DELETE FROM security_audit_events WHERE sequence = 2;'
      : 'DELETE FROM security_audit_events;');
    control.close();
    const reopened = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
    try {
      const summary = await reopened.verifyIntegrity(new Date().toISOString());
      assert.equal(summary.status, 'invalid');
      assert.equal(summary.assurance, 'local_authenticated_head');
      assert.equal(summary.externallyAnchored, false);
    } finally {
      reopened.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('concurrent worker connections idempotently append the same event id and payload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'security-audit-idempotency-'));
  const path = join(directory, 'audit.sqlite');
  const initial = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
  initial.close();
  const command = event();
  try {
    await Promise.all([
      appendFromWorker(path, command),
      appendFromWorker(path, command),
    ]);
    const repository = new SqliteSecurityAuditRepository(path, new Map([['v1', key]]), 'v1');
    try {
      assert.equal((await repository.list({ limit: 10, offset: 0 })).total, 1);
      assert.equal((await repository.verifyIntegrity(new Date().toISOString())).status, 'valid');
    } finally {
      repository.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function appendFromWorker(path: string, command: SecurityAuditCommand): Promise<void> {
  const moduleUrl = new URL('./sqlite-repository.ts', import.meta.url).href;
  const source = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { SqliteSecurityAuditRepository } = await import(workerData.moduleUrl);
      const repository = new SqliteSecurityAuditRepository(
        workerData.path,
        new Map([['v1', Buffer.from(workerData.key, 'base64')]]),
        'v1',
      );
      try { await repository.append(workerData.command); }
      finally { repository.close(); }
      parentPort.postMessage({ ok: true });
    })().catch((error) => parentPort.postMessage({ error: error.message }));
  `;
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData: { command, key: key.toString('base64'), moduleUrl, path },
    });
    worker.once('message', (message: { error?: string; ok?: boolean }) => {
      if (message.ok) resolve();
      else reject(new Error(message.error ?? 'Audit worker failed.'));
    });
    worker.once('error', reject);
  });
}

function downgradeToV1(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP TABLE security_audit_head;
      DELETE FROM security_audit_schema_migrations WHERE version >= 2;
      COMMIT;
    `);
  } finally {
    database.close();
  }
}

function downgradeToV2(path: string): void {
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      BEGIN IMMEDIATE;
      DROP TRIGGER security_audit_no_update;
      DROP TRIGGER security_audit_no_delete;
      DROP INDEX security_audit_time_idx;
      DROP INDEX security_audit_filter_idx;
      DROP INDEX security_audit_actor_idx;
      CREATE TABLE security_audit_events_v2 (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('authentication','authorization','books','documents','reviews')),
        action TEXT NOT NULL CHECK (action IN (
          'auth.login','auth.logout','auth.session_revoked','authorization.denied',
          'book.edition_status_changed','book.edition_published','book.edition_restored',
          'document.ocr_approved','review.status_changed','review.decision_recorded'
        )),
        outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','failure')),
        actor_user_id TEXT,
        subject_type TEXT CHECK (subject_type IS NULL OR subject_type IN (
          'user','session','book_edition','document','review_item'
        )),
        subject_id TEXT,
        request_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
        previous_hash TEXT NOT NULL CHECK (length(previous_hash) = 64),
        event_hash TEXT NOT NULL UNIQUE CHECK (length(event_hash) = 64),
        key_version TEXT NOT NULL,
        CHECK ((subject_type IS NULL) = (subject_id IS NULL))
      ) STRICT;
      INSERT INTO security_audit_events_v2 SELECT * FROM security_audit_events;
      DROP TABLE security_audit_events;
      ALTER TABLE security_audit_events_v2 RENAME TO security_audit_events;
      CREATE INDEX security_audit_time_idx ON security_audit_events(timestamp DESC, sequence DESC);
      CREATE INDEX security_audit_filter_idx ON security_audit_events(category, action, outcome, timestamp DESC);
      CREATE INDEX security_audit_actor_idx ON security_audit_events(actor_user_id, timestamp DESC);
      CREATE TRIGGER security_audit_no_update BEFORE UPDATE ON security_audit_events BEGIN
        SELECT RAISE(ABORT, 'security audit events are append-only');
      END;
      CREATE TRIGGER security_audit_no_delete BEFORE DELETE ON security_audit_events BEGIN
        SELECT RAISE(ABORT, 'security audit events are append-only');
      END;
      DELETE FROM security_audit_schema_migrations WHERE version = 3;
      COMMIT;
    `);
  } finally {
    database.close();
  }
}

function assertSchemaVersion(path: string, expected: number): void {
  const database = new DatabaseSync(path);
  try {
    const row = database.prepare(`
      SELECT MAX(version) AS version FROM security_audit_schema_migrations
    `).get() as unknown as { version: number };
    assert.equal(row.version, expected);
  } finally {
    database.close();
  }
}

function assertV1Shape(path: string): void {
  const database = new DatabaseSync(path);
  try {
    const head = database.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'security_audit_head'
    `).get() as unknown as { count: number };
    const version = database.prepare(`
      SELECT MAX(version) AS version FROM security_audit_schema_migrations
    `).get() as unknown as { version: number };
    assert.equal(head.count, 0);
    assert.equal(version.version, 1);
  } finally {
    database.close();
  }
}

function event(overrides: Partial<SecurityAuditCommand> = {}): SecurityAuditCommand {
  return {
    action: 'auth.logout', actorUserId: 'user-1', category: 'authentication', id: randomUUID(),
    metadata: {}, outcome: 'success', requestId: randomUUID(), subjectId: 'user-1',
    subjectType: 'user', timestamp: new Date().toISOString(), ...overrides,
  };
}
