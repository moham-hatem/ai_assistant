import type { SecurityAuditIntegritySummary, SecurityAuditPage } from '../../../shared/contracts/security-audit.ts';
import type { SecurityAuditCommand } from './domain.ts';
import type { SecurityAuditQuery, SecurityAuditRepository } from './repository.ts';

export class UnavailableSecurityAuditRepository implements SecurityAuditRepository {
  private readonly cause?: unknown;

  constructor(cause?: unknown) {
    this.cause = cause;
  }

  append(_command: SecurityAuditCommand): Promise<void> { return Promise.reject(this.error()); }
  list(_query: SecurityAuditQuery): Promise<SecurityAuditPage> { return Promise.reject(this.error()); }
  verifyIntegrity(_checkedAt: string): Promise<SecurityAuditIntegritySummary> {
    return Promise.reject(this.error());
  }
  close(): void {}

  private error(): Error {
    return new Error('Local security audit storage is unavailable.', { cause: this.cause });
  }
}
