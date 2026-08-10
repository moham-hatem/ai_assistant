import { randomUUID } from 'node:crypto';
import type { SecurityAuditIntegritySummary, SecurityAuditPage } from '../../../shared/contracts/security-audit.ts';
import { validateSecurityAuditCommand, type SecurityAuditCommand } from './domain.ts';
import type { SecurityAuditQuery, SecurityAuditRepository, SecurityAuditSink } from './repository.ts';
import { AppError } from '../../errors.ts';

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

  async record(command: SecurityAuditCommand): Promise<void> {
    const validated = validateSecurityAuditCommand(command);
    try { await this.repository.append(validated); }
    catch (error) { throw unavailable(error); }
  }

  recordNew(command: Omit<SecurityAuditCommand, 'id' | 'timestamp'>): Promise<void> {
    return this.record({ ...command, id: this.createId(), timestamp: this.now().toISOString() });
  }

  async bestEffort(command: Omit<SecurityAuditCommand, 'id' | 'timestamp'>): Promise<void> {
    try { await this.recordNew(command); } catch (error) { this.logFailure(error); }
  }

  async list(query: SecurityAuditQuery): Promise<SecurityAuditPage> {
    try { return await this.repository.list(query); }
    catch (error) { throw unavailable(error); }
  }
  async verifyIntegrity(): Promise<SecurityAuditIntegritySummary> {
    try { return await this.repository.verifyIntegrity(this.now().toISOString()); }
    catch (error) { throw unavailable(error); }
  }
}

function unavailable(error: unknown): AppError {
  if (error instanceof AppError && error.code === 'SECURITY_AUDIT_UNAVAILABLE') return error;
  return new AppError(
    'SECURITY_AUDIT_UNAVAILABLE',
    'Security audit is temporarily unavailable.',
    503,
    { cause: error },
  );
}
