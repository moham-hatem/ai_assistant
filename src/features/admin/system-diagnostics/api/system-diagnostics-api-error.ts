export class SystemDiagnosticsApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'SystemDiagnosticsApiError';
    this.status = status;
  }
}
