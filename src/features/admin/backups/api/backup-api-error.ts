export class BackupApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'BackupApiError';
    this.status = status;
  }
}
