export class SecurityAuditApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'SecurityAuditApiError';
    this.status = status;
  }
}
