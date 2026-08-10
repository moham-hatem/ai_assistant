import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSecurityAuditState,
  securityAuditReducer,
  visibleAuditRange,
} from '../../src/features/admin/security-audit/security-audit-state.ts';
import type { SecurityAuditSnapshot } from '../../src/features/admin/security-audit/types.ts';

const snapshot: SecurityAuditSnapshot = {
  integrity: {
    assurance: 'local_authenticated_head', checkedAt: '2026-08-10T12:00:00.000Z',
    checkedEvents: 30, externallyAnchored: false, firstInvalidSequence: null,
    keyVersions: ['v1'], status: 'valid', totalEvents: 30,
  },
  page: { items: [], limit: 25, offset: 0, total: 30 },
};

test('security audit state validates and applies exact filters', () => {
  let state = createSecurityAuditState();
  state = securityAuditReducer(state, { field: 'category', type: 'draft-changed', value: 'access' });
  state = securityAuditReducer(state, { field: 'actorUserId', type: 'draft-changed', value: 'admin-user' });
  state = securityAuditReducer(state, { type: 'apply' });
  assert.deepEqual(state.filters, { actorUserId: 'admin-user', category: 'access' });
  assert.equal(state.status, 'loading');

  state = securityAuditReducer(state, { field: 'requestId', type: 'draft-changed', value: 'spaces are invalid' });
  state = securityAuditReducer(state, { type: 'apply' });
  assert.equal(state.validationError, 'invalid-identifier');
});

test('security audit state rejects reversed dates without replacing active filters', () => {
  let state = createSecurityAuditState();
  state = securityAuditReducer(state, { field: 'from', type: 'draft-changed', value: '2026-08-11T10:00' });
  state = securityAuditReducer(state, { field: 'to', type: 'draft-changed', value: '2026-08-10T10:00' });
  state = securityAuditReducer(state, { type: 'apply' });
  assert.equal(state.validationError, 'invalid-range');
  assert.deepEqual(state.filters, {});
});

test('security audit state keeps pagination inside available boundaries', () => {
  let state = securityAuditReducer(createSecurityAuditState(), { snapshot, type: 'loaded' });
  assert.deepEqual(visibleAuditRange(state), { start: 0, end: 0, total: 30 });
  state = securityAuditReducer(state, { type: 'next' });
  assert.equal(state.offset, 25);
  assert.equal(state.status, 'loading');
  state = securityAuditReducer(state, { type: 'previous' });
  assert.equal(state.offset, 0);
  assert.equal(securityAuditReducer(state, { type: 'previous' }), state);
});
