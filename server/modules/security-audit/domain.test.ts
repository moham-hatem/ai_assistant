import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type {
  SecurityAuditAction,
  SecurityAuditSubjectType,
} from '../../../shared/contracts/security-audit.ts';
import {
  SecurityAuditValidationError,
  validateSecurityAuditCommand,
  type SecurityAuditCommand,
} from './domain.ts';

const accessCases: Array<{
  action: SecurityAuditAction;
  metadata: Record<string, boolean | number | string>;
  subjectType: SecurityAuditSubjectType;
}> = [
  { action: 'access.user_profile_changed', metadata: { changed: true }, subjectType: 'user' },
  { action: 'access.user_roles_changed', metadata: { changed: true, nextRoleCount: 2, previousRoleCount: 1 }, subjectType: 'user' },
  { action: 'access.user_enabled', metadata: { changed: false }, subjectType: 'user' },
  { action: 'access.user_disabled', metadata: { changed: true }, subjectType: 'user' },
  { action: 'access.user_sessions_revoked', metadata: { reason: 'administrative', sessionCount: 0 }, subjectType: 'user' },
  { action: 'access.invitation_created', metadata: { roleCount: 1 }, subjectType: 'invitation' },
  { action: 'access.invitation_revoked', metadata: {}, subjectType: 'invitation' },
  { action: 'access.invitation_redeemed', metadata: { roleCount: 1 }, subjectType: 'user' },
  { action: 'access.recovery_created', metadata: {}, subjectType: 'recovery' },
  { action: 'access.recovery_revoked', metadata: {}, subjectType: 'recovery' },
  { action: 'access.recovery_redeemed', metadata: {}, subjectType: 'user' },
];

test('access lifecycle actions are typed and accept only their metadata allowlists', () => {
  for (const item of accessCases) {
    const command = accessEvent(item.action, item.subjectType, item.metadata);
    assert.deepEqual(validateSecurityAuditCommand(command).metadata, item.metadata);
    assert.throws(
      () => validateSecurityAuditCommand({
        ...command,
        metadata: { ...item.metadata, unexpectedField: 'never' },
      }),
      SecurityAuditValidationError,
      item.action,
    );
  }
});

test('access audit validation rejects secret-shaped metadata and mismatched categories', () => {
  const base = accessEvent('access.invitation_created', 'invitation', { roleCount: 1 });
  for (const key of ['email', 'password', 'token', 'link', 'rawHash', 'secret']) {
    assert.throws(
      () => validateSecurityAuditCommand({ ...base, metadata: { [key]: 'sensitive' } }),
      SecurityAuditValidationError,
      key,
    );
  }
  assert.throws(
    () => validateSecurityAuditCommand({ ...base, category: 'authentication' }),
    SecurityAuditValidationError,
  );
  assert.throws(
    () => validateSecurityAuditCommand({ ...base, subjectType: 'user' }),
    SecurityAuditValidationError,
  );
  assert.throws(
    () => validateSecurityAuditCommand({ ...base, actorUserId: null }),
    SecurityAuditValidationError,
  );
  assert.throws(
    () => validateSecurityAuditCommand({ ...base, metadata: { roleCount: 'one' } }),
    SecurityAuditValidationError,
  );
  assert.throws(
    () => validateSecurityAuditCommand({ ...base, metadata: { reason: 'free-form' } }),
    SecurityAuditValidationError,
  );
  const redemption = {
    ...accessEvent('access.recovery_redeemed', 'user', {}),
    actorUserId: 'admin-1',
  };
  assert.throws(
    () => validateSecurityAuditCommand(redemption),
    SecurityAuditValidationError,
  );
  assert.doesNotThrow(
    () => validateSecurityAuditCommand({ ...redemption, actorUserId: null }),
  );
});

function accessEvent(
  action: SecurityAuditAction,
  subjectType: SecurityAuditSubjectType,
  metadata: Record<string, boolean | number | string>,
): SecurityAuditCommand {
  return {
    action,
    actorUserId: action.endsWith('_redeemed') ? null : 'admin-1',
    category: 'access',
    id: randomUUID(),
    metadata,
    outcome: 'success',
    requestId: randomUUID(),
    subjectId: 'subject-1',
    subjectType,
    timestamp: new Date().toISOString(),
  };
}
