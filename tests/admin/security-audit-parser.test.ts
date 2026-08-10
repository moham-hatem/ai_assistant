import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSecurityAuditEvent,
  parseSecurityAuditIntegrity,
  parseSecurityAuditPage,
  SecurityAuditApiError,
} from '../../src/features/admin/security-audit/api/security-audit-parser.ts';

const event = {
  action: 'access.user_roles_changed',
  actorUserId: 'admin-user',
  category: 'access',
  eventHash: 'a'.repeat(64),
  id: 'b6f245b1-415e-46f8-b90f-01246249bfcc',
  keyVersion: 'v1',
  metadata: { changed: true, nextRoleCount: 2, previousRoleCount: 1, reason: 'administrative' },
  outcome: 'success',
  previousHash: '0'.repeat(64),
  requestId: 'request-1',
  sequence: 2,
  subjectId: 'teacher-user',
  subjectType: 'user',
  timestamp: '2026-08-10T12:00:00.000Z',
} as const;

test('security audit parsers accept list and integrity contracts', () => {
  const page = parseSecurityAuditPage({
    items: [event, { ...event, eventHash: 'b'.repeat(64), id: 'd81a4e15-a1cd-47d8-993b-96980e1d123e', sequence: 1 }],
    limit: 25,
    offset: 0,
    requestId: 'request-page',
    total: 2,
  });
  assert.equal(page.items[0]?.metadata.changed, true);
  assert.equal(page.total, 2);

  const integrity = parseSecurityAuditIntegrity({
    integrity: {
      assurance: 'local_authenticated_head',
      checkedAt: '2026-08-10T12:01:00.000Z',
      checkedEvents: 2,
      externallyAnchored: false,
      firstInvalidSequence: null,
      keyVersions: ['v1'],
      status: 'valid',
      totalEvents: 2,
    },
    requestId: 'request-integrity',
  });
  assert.equal(integrity.status, 'valid');
  assert.equal(integrity.externallyAnchored, false);
});

test('security audit parsers reject malformed and over-permissive data', () => {
  assert.throws(() => parseSecurityAuditEvent({ ...event, metadata: { token: { raw: 'secret' } } }), SecurityAuditApiError);
  assert.throws(() => parseSecurityAuditEvent({ ...event, metadata: { token: 'secret' } }), SecurityAuditApiError);
  assert.throws(() => parseSecurityAuditEvent({ ...event, subjectId: null }), SecurityAuditApiError);
  assert.throws(() => parseSecurityAuditEvent({ ...event, eventHash: 'not-a-hash' }), SecurityAuditApiError);
  assert.throws(() => parseSecurityAuditPage({
    items: [{ ...event, sequence: 1 }, event], limit: 25, offset: 0, requestId: 'request', total: 2,
  }), SecurityAuditApiError);
  assert.throws(() => parseSecurityAuditIntegrity({
    integrity: {
      assurance: 'local_authenticated_head', checkedAt: '2026-08-10T12:01:00.000Z',
      checkedEvents: 1, externallyAnchored: false, firstInvalidSequence: null,
      keyVersions: ['v1'], status: 'valid', totalEvents: 2,
    },
    requestId: 'request-integrity',
  }), SecurityAuditApiError);
});
