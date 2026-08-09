import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { SecurityAuditCommand } from './domain.ts';
import { SecurityAuditService } from './service.ts';
import { enqueueSecurityAudit, flushSecurityAuditOutbox, migrateSecurityAuditOutbox } from './sqlite-outbox.ts';
import { SqliteSecurityAuditRepository } from './sqlite-repository.ts';

test('outbox retries after delivery acknowledgement loss without duplicating the audit event', async () => {
  const source = new DatabaseSync(':memory:');
  migrateSecurityAuditOutbox(source);
  const target = new SqliteSecurityAuditRepository(':memory:', new Map([['v1', randomBytes(32)]]), 'v1');
  const audit = new SecurityAuditService(target);
  const command: SecurityAuditCommand = {
    action: 'review.decision_recorded', actorUserId: 'reviewer-1', category: 'reviews',
    id: randomUUID(), metadata: { decisionOutcome: 'approved', hasCorrection: true },
    outcome: 'success', requestId: randomUUID(), subjectId: randomUUID(),
    subjectType: 'review_item', timestamp: new Date().toISOString(),
  };
  enqueueSecurityAudit(source, command);
  let first = true;
  await assert.rejects(flushSecurityAuditOutbox(source, {
    async record(value) {
      await audit.record(value);
      if (first) { first = false; throw new Error('acknowledgement lost'); }
    },
  }));
  assert.equal(await flushSecurityAuditOutbox(source, audit), 1);
  assert.equal((await audit.list({ limit: 10, offset: 0 })).total, 1);
  source.close();
  target.close();
});
