export const SECURITY_AUDIT_CATEGORIES = ['authentication', 'authorization', 'books', 'documents', 'reviews'] as const;
export type SecurityAuditCategory = (typeof SECURITY_AUDIT_CATEGORIES)[number];

export const SECURITY_AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.session_revoked',
  'authorization.denied',
  'book.edition_status_changed',
  'book.edition_published',
  'book.edition_restored',
  'document.ocr_approved',
  'review.status_changed',
  'review.decision_recorded',
] as const;
export type SecurityAuditAction = (typeof SECURITY_AUDIT_ACTIONS)[number];

export const SECURITY_AUDIT_OUTCOMES = ['success', 'denied', 'failure'] as const;
export type SecurityAuditOutcome = (typeof SECURITY_AUDIT_OUTCOMES)[number];

export const SECURITY_AUDIT_SUBJECT_TYPES = [
  'user', 'session', 'book_edition', 'document', 'review_item',
] as const;
export type SecurityAuditSubjectType = (typeof SECURITY_AUDIT_SUBJECT_TYPES)[number];

export type SecurityAuditMetadataValue = boolean | number | string;

export interface SecurityAuditEvent {
  action: SecurityAuditAction;
  actorUserId: string | null;
  category: SecurityAuditCategory;
  eventHash: string;
  id: string;
  keyVersion: string;
  metadata: Record<string, SecurityAuditMetadataValue>;
  outcome: SecurityAuditOutcome;
  previousHash: string;
  requestId: string;
  sequence: number;
  subjectId: string | null;
  subjectType: SecurityAuditSubjectType | null;
  timestamp: string;
}

export interface SecurityAuditPage {
  items: SecurityAuditEvent[];
  limit: number;
  offset: number;
  total: number;
}

export interface SecurityAuditIntegritySummary {
  checkedAt: string;
  checkedEvents: number;
  firstInvalidSequence: number | null;
  keyVersions: string[];
  status: 'valid' | 'invalid' | 'unverifiable';
  totalEvents: number;
}
