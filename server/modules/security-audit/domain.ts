import {
  SECURITY_AUDIT_ACTIONS,
  SECURITY_AUDIT_CATEGORIES,
  SECURITY_AUDIT_OUTCOMES,
  SECURITY_AUDIT_SUBJECT_TYPES,
  type SecurityAuditAction,
  type SecurityAuditCategory,
  type SecurityAuditMetadataValue,
  type SecurityAuditOutcome,
  type SecurityAuditSubjectType,
} from '../../../shared/contracts/security-audit.ts';

export interface SecurityAuditCommand {
  action: SecurityAuditAction;
  actorUserId: string | null;
  category: SecurityAuditCategory;
  id: string;
  metadata?: Record<string, SecurityAuditMetadataValue>;
  outcome: SecurityAuditOutcome;
  requestId: string;
  subjectId: string | null;
  subjectType: SecurityAuditSubjectType | null;
  timestamp: string;
}

export interface SecurityAuditContext {
  actorUserId: string;
  requestId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const identifier = /^[\p{L}\p{N}._:@/-]{1,128}$/u;
const requestIdentifier = /^[A-Za-z0-9._:-]{1,128}$/u;
const actionCategories: Record<SecurityAuditAction, SecurityAuditCategory> = {
  'access.invitation_created': 'access',
  'access.invitation_redeemed': 'access',
  'access.invitation_revoked': 'access',
  'access.recovery_created': 'access',
  'access.recovery_redeemed': 'access',
  'access.recovery_revoked': 'access',
  'access.user_disabled': 'access',
  'access.user_enabled': 'access',
  'access.user_profile_changed': 'access',
  'access.user_roles_changed': 'access',
  'access.user_sessions_revoked': 'access',
  'auth.login': 'authentication',
  'auth.logout': 'authentication',
  'auth.session_revoked': 'authentication',
  'authorization.denied': 'authorization',
  'book.edition_status_changed': 'books',
  'book.edition_published': 'books',
  'book.edition_restored': 'books',
  'document.ocr_approved': 'documents',
  'review.status_changed': 'reviews',
  'review.decision_recorded': 'reviews',
};
const metadataKeys: Record<SecurityAuditAction, readonly string[]> = {
  'access.invitation_created': ['reason', 'roleCount'],
  'access.invitation_redeemed': ['reason', 'roleCount'],
  'access.invitation_revoked': ['reason'],
  'access.recovery_created': ['reason'],
  'access.recovery_redeemed': ['reason'],
  'access.recovery_revoked': ['reason'],
  'access.user_disabled': ['changed', 'reason'],
  'access.user_enabled': ['changed', 'reason'],
  'access.user_profile_changed': ['changed', 'reason'],
  'access.user_roles_changed': ['changed', 'nextRoleCount', 'previousRoleCount', 'reason'],
  'access.user_sessions_revoked': ['reason', 'sessionCount'],
  'auth.login': ['reason'],
  'auth.logout': [],
  'auth.session_revoked': ['reason'],
  'authorization.denied': ['method', 'permission', 'reason'],
  'book.edition_status_changed': ['fromStatus', 'toStatus'],
  'book.edition_published': ['fromStatus'],
  'book.edition_restored': ['fromStatus'],
  'document.ocr_approved': ['fromStatus', 'toStatus'],
  'review.status_changed': ['fromStatus', 'toStatus'],
  'review.decision_recorded': ['decisionOutcome', 'hasCorrection'],
};
const accessSubjectTypes: Partial<Record<SecurityAuditAction, SecurityAuditSubjectType>> = {
  'access.invitation_created': 'invitation',
  'access.invitation_redeemed': 'user',
  'access.invitation_revoked': 'invitation',
  'access.recovery_created': 'recovery',
  'access.recovery_redeemed': 'user',
  'access.recovery_revoked': 'recovery',
  'access.user_disabled': 'user',
  'access.user_enabled': 'user',
  'access.user_profile_changed': 'user',
  'access.user_roles_changed': 'user',
  'access.user_sessions_revoked': 'user',
};
const publicRedemptionActions = new Set<SecurityAuditAction>([
  'access.invitation_redeemed', 'access.recovery_redeemed',
]);
const administrativeAccessActions = new Set<SecurityAuditAction>([
  'access.invitation_created', 'access.invitation_revoked',
  'access.recovery_created', 'access.recovery_revoked',
  'access.user_disabled', 'access.user_enabled',
  'access.user_profile_changed', 'access.user_roles_changed',
]);
const accessReasons = new Set([
  'administrative', 'conflict', 'invalid_or_expired', 'invalid_request', 'last_admin',
  'not_found', 'rate_limited', 'recovery_redeemed', 'self_lockout', 'storage_failure',
  'sibling_redeemed', 'user_access_changed', 'user_disabled',
]);
const forbiddenMetadataName = /(email|password|passphrase|secret|token|cookie|link|hash|question|answer|content|bookText|text)/iu;

export function validateSecurityAuditCommand(command: SecurityAuditCommand): SecurityAuditCommand {
  if (!uuid.test(command.id)) invalid('Audit event id must be a UUID.');
  if (!SECURITY_AUDIT_ACTIONS.includes(command.action)) invalid('Unknown audit action.');
  if (!SECURITY_AUDIT_CATEGORIES.includes(command.category)
      || actionCategories[command.action] !== command.category) invalid('Audit category does not match action.');
  if (!SECURITY_AUDIT_OUTCOMES.includes(command.outcome)) invalid('Unknown audit outcome.');
  if (!requestIdentifier.test(command.requestId)) invalid('Invalid audit request id.');
  if (!isUtcTimestamp(command.timestamp)) invalid('Audit timestamp must be canonical UTC.');
  if (command.actorUserId !== null && !identifier.test(command.actorUserId)) invalid('Invalid actor id.');
  if ((command.subjectType === null) !== (command.subjectId === null)) {
    invalid('Audit subject type and id must both be present or absent.');
  }
  if (command.subjectType !== null && !SECURITY_AUDIT_SUBJECT_TYPES.includes(command.subjectType)) {
    invalid('Unknown audit subject type.');
  }
  if (command.subjectId !== null && !identifier.test(command.subjectId)) invalid('Invalid subject id.');
  const expectedAccessSubject = accessSubjectTypes[command.action];
  if (expectedAccessSubject && command.subjectType !== null
      && command.subjectType !== expectedAccessSubject) invalid('Audit subject type does not match action.');
  if (expectedAccessSubject && command.outcome === 'success'
      && command.subjectType !== expectedAccessSubject) invalid('Successful access events require a subject.');
  if (publicRedemptionActions.has(command.action) && command.actorUserId !== null) {
    invalid('Public redemption events cannot have an actor.');
  }
  const siblingRevocation = (command.action === 'access.invitation_revoked'
      || command.action === 'access.recovery_revoked')
    && command.metadata?.reason === 'sibling_redeemed';
  if (administrativeAccessActions.has(command.action) && command.actorUserId === null
      && !siblingRevocation) {
    invalid('Administrative access events require an actor.');
  }
  const metadata = command.metadata ?? {};
  const allowed = metadataKeys[command.action];
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowed.includes(key) || forbiddenMetadataName.test(key)) invalid('Audit metadata field is not allowed.');
    if (!['string', 'number', 'boolean'].includes(typeof value)) invalid('Invalid audit metadata value.');
    if (typeof value === 'string' && (value.length > 80 || /[\r\n\0]/u.test(value))) {
      invalid('Audit metadata string is invalid.');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) invalid('Audit metadata number is invalid.');
    if (command.category === 'access' && (key.endsWith('RoleCount') || key === 'roleCount')) {
      if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 4) {
        invalid('Access audit role count is invalid.');
      }
    }
    if (command.category === 'access' && key === 'changed' && typeof value !== 'boolean') {
      invalid('Access audit change flag is invalid.');
    }
    if (command.category === 'access' && key === 'sessionCount'
        && (!Number.isSafeInteger(value) || Number(value) < 0)) {
      invalid('Access audit session count is invalid.');
    }
    if (command.category === 'access' && key === 'reason'
        && (typeof value !== 'string' || !accessReasons.has(value))) {
      invalid('Access audit reason is invalid.');
    }
  }
  return { ...command, metadata: sortMetadata(metadata) };
}

export function canonicalAuditPayload(command: SecurityAuditCommand, previousHash: string, keyVersion: string): string {
  const value = validateSecurityAuditCommand(command);
  return JSON.stringify([
    value.id, value.timestamp, value.category, value.action, value.outcome,
    value.actorUserId, value.subjectType, value.subjectId, value.requestId,
    value.metadata, previousHash, keyVersion,
  ]);
}

function sortMetadata(metadata: Record<string, SecurityAuditMetadataValue>) {
  return Object.fromEntries(Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)));
}

function isUtcTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function invalid(message: string): never {
  throw new SecurityAuditValidationError(message);
}

export class SecurityAuditValidationError extends Error {}
