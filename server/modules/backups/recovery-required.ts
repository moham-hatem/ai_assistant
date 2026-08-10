export class RestoreRecoveryRequiredError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'RestoreRecoveryRequiredError';
  }
}

export function recoveryRequired(error: unknown): error is RestoreRecoveryRequiredError {
  return error instanceof RestoreRecoveryRequiredError;
}
