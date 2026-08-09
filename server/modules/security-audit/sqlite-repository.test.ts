import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
    assert.throws(
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

function event(overrides: Partial<SecurityAuditCommand> = {}): SecurityAuditCommand {
  return {
    action: 'auth.logout', actorUserId: 'user-1', category: 'authentication', id: randomUUID(),
    metadata: {}, outcome: 'success', requestId: randomUUID(), subjectId: 'user-1',
    subjectType: 'user', timestamp: new Date().toISOString(), ...overrides,
  };
}
