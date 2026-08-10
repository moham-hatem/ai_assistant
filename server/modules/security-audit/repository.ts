import type {
  SecurityAuditIntegritySummary,
  SecurityAuditPage,
  SecurityAuditAction,
  SecurityAuditCategory,
  SecurityAuditOutcome,
  SecurityAuditSubjectType,
} from '../../../shared/contracts/security-audit.ts';
import type { SecurityAuditCommand } from './domain.ts';

export interface SecurityAuditQuery {
  action?: SecurityAuditAction;
  actorUserId?: string;
  category?: SecurityAuditCategory;
  from?: string;
  limit: number;
  offset: number;
  outcome?: SecurityAuditOutcome;
  requestId?: string;
  subjectId?: string;
  subjectType?: SecurityAuditSubjectType;
  to?: string;
}

export interface SecurityAuditRepository {
  append(command: SecurityAuditCommand): Promise<void>;
  list(query: SecurityAuditQuery): Promise<SecurityAuditPage>;
  verifyIntegrity(checkedAt: string): Promise<SecurityAuditIntegritySummary>;
  close(): void;
}

export interface SecurityAuditSink {
  record(command: SecurityAuditCommand): Promise<void>;
}
