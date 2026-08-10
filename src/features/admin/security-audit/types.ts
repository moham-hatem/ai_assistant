import type {
  SecurityAuditAction,
  SecurityAuditCategory,
  SecurityAuditIntegritySummary,
  SecurityAuditOutcome,
  SecurityAuditPage,
  SecurityAuditSubjectType,
} from '../../../../shared/contracts/security-audit';

export type {
  SecurityAuditEvent,
  SecurityAuditIntegritySummary,
  SecurityAuditPage,
} from '../../../../shared/contracts/security-audit';

export interface SecurityAuditFilters {
  action?: SecurityAuditAction;
  actorUserId?: string;
  category?: SecurityAuditCategory;
  from?: string;
  outcome?: SecurityAuditOutcome;
  requestId?: string;
  subjectId?: string;
  subjectType?: SecurityAuditSubjectType;
  to?: string;
}

export type SecurityAuditFilterDraft = Record<keyof SecurityAuditFilters, string>;
export type SecurityAuditLoadStatus = 'loading' | 'ready' | 'error';

export interface SecurityAuditSnapshot {
  integrity: SecurityAuditIntegritySummary;
  page: SecurityAuditPage;
}
