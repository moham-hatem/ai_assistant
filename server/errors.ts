export type AppErrorCode =
  | 'INVALID_REQUEST'
  | 'DOCUMENT_NOT_FOUND'
  | 'KNOWLEDGE_NOT_CONFIGURED'
  | 'METHOD_NOT_ALLOWED'
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_UNAVAILABLE'
  | 'REQUEST_TOO_LARGE';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}
