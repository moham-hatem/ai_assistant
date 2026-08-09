import { randomUUID } from 'node:crypto';
import type {
  SecurityAuditAction,
  SecurityAuditMetadataValue,
  SecurityAuditOutcome,
  SecurityAuditSubjectType,
} from '../../shared/contracts/security-audit.ts';
import type { SecurityAuditCommand } from '../modules/security-audit/domain.ts';
import type { SecurityAuditSink } from '../modules/security-audit/repository.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';

export type AccessAuditAction = Extract<SecurityAuditAction, `access.${string}`>;

export interface AccessAuditSubject {
  id: string;
  type: Extract<SecurityAuditSubjectType, 'invitation' | 'recovery' | 'user'>;
}

export class AccessAuditEmitter {
  private readonly audit?: SecurityAuditService;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly outbox?: {
    enqueueSecurityAudit?(command: SecurityAuditCommand): Promise<void>;
    flushSecurityAuditOutbox?(sink: SecurityAuditSink): Promise<number>;
  };

  constructor(
    audit?: SecurityAuditService,
    outbox?: {
      enqueueSecurityAudit?(command: SecurityAuditCommand): Promise<void>;
      flushSecurityAuditOutbox?(sink: SecurityAuditSink): Promise<number>;
    },
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.audit = audit;
    this.outbox = outbox;
    this.now = now;
    this.createId = createId;
  }

  get enabled(): boolean {
    return this.audit !== undefined;
  }

  success(
    action: AccessAuditAction,
    requestId: string,
    timestamp: string,
    actorUserId: string | null,
    subject: AccessAuditSubject,
    metadata: Record<string, SecurityAuditMetadataValue> = {},
  ): SecurityAuditCommand | undefined {
    return this.audit ? {
      action,
      actorUserId,
      category: 'access',
      id: this.createId(),
      metadata,
      outcome: 'success',
      requestId,
      subjectId: subject.id,
      subjectType: subject.type,
      timestamp,
    } : undefined;
  }

  async bestEffort(
    action: AccessAuditAction,
    outcome: Exclude<SecurityAuditOutcome, 'success'>,
    requestId: string,
    actorUserId: string | null,
    subject: AccessAuditSubject | null,
    metadata: Record<string, SecurityAuditMetadataValue> = {},
  ): Promise<void> {
    if (!this.audit) return;
    const command: SecurityAuditCommand = {
      action,
      actorUserId,
      category: 'access',
      id: this.createId(),
      metadata,
      outcome,
      requestId,
      subjectId: subject?.id ?? null,
      subjectType: subject?.type ?? null,
      timestamp: this.now().toISOString(),
    };
    let enqueued = false;
    try {
      if (this.outbox?.enqueueSecurityAudit) {
        await this.outbox.enqueueSecurityAudit(command);
        enqueued = true;
        await this.flush(this.outbox);
      } else {
        await this.audit.bestEffort(command);
      }
    } catch {
      if (!enqueued) {
        const { id: _id, timestamp: _timestamp, ...fallback } = command;
        await this.audit.bestEffort(fallback);
      }
      // Expected denials retain their original response; enqueued events retry from the outbox.
    }
  }

  async flush(repository: {
    flushSecurityAuditOutbox?(sink: SecurityAuditSink): Promise<number>;
  }): Promise<void> {
    if (this.audit && repository.flushSecurityAuditOutbox) {
      await repository.flushSecurityAuditOutbox(this.audit);
    }
  }
}
