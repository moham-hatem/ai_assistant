import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import { SecurityAuditValidationError, type SecurityAuditCommand } from './domain.ts';
import { SecurityAuditService } from './service.ts';
import { SqliteSecurityAuditRepository } from './sqlite-repository.ts';

const key = randomBytes(32);

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

function event(overrides: Partial<SecurityAuditCommand> = {}): SecurityAuditCommand {
  return {
    action: 'auth.logout', actorUserId: 'user-1', category: 'authentication', id: randomUUID(),
    metadata: {}, outcome: 'success', requestId: randomUUID(), subjectId: 'user-1',
    subjectType: 'user', timestamp: new Date().toISOString(), ...overrides,
  };
}
