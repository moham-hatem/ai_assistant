import { randomUUID } from 'node:crypto';
import type { SecurityAuditIntegritySummary, SecurityAuditPage } from '../../../shared/contracts/security-audit.ts';
import { validateSecurityAuditCommand, type SecurityAuditCommand } from './domain.ts';
import type { SecurityAuditQuery, SecurityAuditRepository, SecurityAuditSink } from './repository.ts';

export class SecurityAuditService implements SecurityAuditSink {
  private readonly repository: SecurityAuditRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly logFailure: (error: unknown) => void;

  constructor(
    repository: SecurityAuditRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
    logFailure: (error: unknown) => void = () => undefined,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
    this.logFailure = logFailure;
  }

  record(command: SecurityAuditCommand): Promise<void> {
    return this.repository.append(validateSecurityAuditCommand(command));
  }

  recordNew(command: Omit<SecurityAuditCommand, 'id' | 'timestamp'>): Promise<void> {
    return this.record({ ...command, id: this.createId(), timestamp: this.now().toISOString() });
  }

  async bestEffort(command: Omit<SecurityAuditCommand, 'id' | 'timestamp'>): Promise<void> {
    try { await this.recordNew(command); } catch (error) { this.logFailure(error); }
  }

  list(query: SecurityAuditQuery): Promise<SecurityAuditPage> { return this.repository.list(query); }
  verifyIntegrity(): Promise<SecurityAuditIntegritySummary> {
    return this.repository.verifyIntegrity(this.now().toISOString());
  }
}
