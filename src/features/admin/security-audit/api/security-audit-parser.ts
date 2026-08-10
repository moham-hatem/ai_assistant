import {
  SECURITY_AUDIT_ACTIONS,
  SECURITY_AUDIT_CATEGORIES,
  SECURITY_AUDIT_OUTCOMES,
  SECURITY_AUDIT_SUBJECT_TYPES,
  type SecurityAuditEvent,
  type SecurityAuditIntegritySummary,
  type SecurityAuditPage,
} from '../../../../../shared/contracts/security-audit';
import { SecurityAuditApiError } from './security-audit-api-error';
import {
  boundedInteger,
  enumeration,
  exactKeys,
  identifierPattern,
  invalid,
  nullableEnumeration,
  nullableIdentifier,
  object,
  parseMetadata,
  patternString,
  timestamp,
} from './security-audit-parser-primitives';

export { SecurityAuditApiError } from './security-audit-api-error';

const eventKeys = [
  'action', 'actorUserId', 'category', 'eventHash', 'id', 'keyVersion', 'metadata',
  'outcome', 'previousHash', 'requestId', 'sequence', 'subjectId', 'subjectType', 'timestamp',
] as const;
const hashPattern = /^[0-9a-f]{64}$/u;
const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseSecurityAuditPage(value: unknown): SecurityAuditPage {
  const payload = object(value, 'page');
  exactKeys(payload, ['items', 'limit', 'offset', 'requestId', 'total'], 'page');
  if (!Array.isArray(payload.items)) invalid('items');
  const limit = boundedInteger(payload.limit, 1, 100, 'limit');
  const offset = boundedInteger(payload.offset, 0, 1_000_000, 'offset');
  const total = boundedInteger(payload.total, 0, Number.MAX_SAFE_INTEGER, 'total');
  const items = payload.items.map(parseSecurityAuditEvent);
  if (items.length > limit || items.length > total) invalid('pagination');
  for (let index = 1; index < items.length; index += 1) {
    if (items[index - 1].sequence <= items[index].sequence) invalid('event order');
  }
  requestId(payload.requestId);
  return { items, limit, offset, total };
}

export function parseSecurityAuditIntegrity(value: unknown): SecurityAuditIntegritySummary {
  const wrapper = object(value, 'integrity response');
  exactKeys(wrapper, ['integrity', 'requestId'], 'integrity response');
  requestId(wrapper.requestId);
  const payload = object(wrapper.integrity, 'integrity');
  exactKeys(payload, [
    'assurance', 'checkedAt', 'checkedEvents', 'externallyAnchored', 'firstInvalidSequence',
    'keyVersions', 'status', 'totalEvents',
  ], 'integrity');
  if (payload.assurance !== 'local_authenticated_head' || payload.externallyAnchored !== false) {
    invalid('integrity assurance');
  }
  if (!Array.isArray(payload.keyVersions) || payload.keyVersions.some((item) => !isIdentifier(item))) {
    invalid('keyVersions');
  }
  const checkedEvents = boundedInteger(payload.checkedEvents, 0, Number.MAX_SAFE_INTEGER, 'checkedEvents');
  const totalEvents = boundedInteger(payload.totalEvents, 0, Number.MAX_SAFE_INTEGER, 'totalEvents');
  if (checkedEvents > totalEvents) invalid('checkedEvents');
  const status = enumeration(payload.status, ['valid', 'invalid', 'unverifiable'] as const, 'status');
  const firstInvalidSequence = payload.firstInvalidSequence === null
    ? null
    : boundedInteger(payload.firstInvalidSequence, 1, Number.MAX_SAFE_INTEGER, 'firstInvalidSequence');
  if (status === 'valid' && (firstInvalidSequence !== null || checkedEvents !== totalEvents)) invalid('valid integrity');
  return {
    assurance: 'local_authenticated_head',
    checkedAt: timestamp(payload.checkedAt, 'checkedAt'),
    checkedEvents,
    externallyAnchored: false,
    firstInvalidSequence,
    keyVersions: [...payload.keyVersions] as string[],
    status,
    totalEvents,
  };
}

export function parseSecurityAuditEvent(value: unknown): SecurityAuditEvent {
  const payload = object(value, 'event');
  exactKeys(payload, eventKeys, 'event');
  const actorUserId = nullableIdentifier(payload.actorUserId, 'actorUserId');
  const subjectId = nullableIdentifier(payload.subjectId, 'subjectId');
  const subjectType = nullableEnumeration(payload.subjectType, SECURITY_AUDIT_SUBJECT_TYPES, 'subjectType');
  if ((subjectId === null) !== (subjectType === null)) invalid('subject');
  return {
    action: enumeration(payload.action, SECURITY_AUDIT_ACTIONS, 'action'),
    actorUserId,
    category: enumeration(payload.category, SECURITY_AUDIT_CATEGORIES, 'category'),
    eventHash: patternString(payload.eventHash, hashPattern, 'eventHash'),
    id: patternString(payload.id, uuidPattern, 'id'),
    keyVersion: patternString(payload.keyVersion, identifierPattern, 'keyVersion'),
    metadata: parseMetadata(payload.metadata),
    outcome: enumeration(payload.outcome, SECURITY_AUDIT_OUTCOMES, 'outcome'),
    previousHash: patternString(payload.previousHash, hashPattern, 'previousHash'),
    requestId: requestId(payload.requestId),
    sequence: boundedInteger(payload.sequence, 1, Number.MAX_SAFE_INTEGER, 'sequence'),
    subjectId,
    subjectType,
    timestamp: timestamp(payload.timestamp, 'timestamp'),
  };
}

function requestId(value: unknown): string {
  return patternString(value, requestIdPattern, 'requestId');
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && identifierPattern.test(value);
}
