export type AppErrorCode =
  | 'BOOK_NOT_FOUND'
  | 'BOOKS_UNAVAILABLE'
  | 'DUPLICATE_EDITION'
  | 'EDITION_CONFLICT'
  | 'EDITION_DOCUMENT_UNAVAILABLE'
  | 'EDITION_NOT_FOUND'
  | 'FEEDBACK_CONFLICT'
  | 'FEEDBACK_NOT_FOUND'
  | 'FEEDBACK_UNAVAILABLE'
  | 'DOCUMENT_IN_USE'
  | 'DOCUMENT_EXTRACTION_FAILED'
  | 'INVALID_REQUEST'
  | 'INVALID_EDITION_TRANSITION'
  | 'DOCUMENT_NOT_FOUND'
  | 'KNOWLEDGE_NOT_CONFIGURED'
  | 'METHOD_NOT_ALLOWED'
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_UNAVAILABLE'
  | 'DUPLICATE_REVIEW'
  | 'INVALID_REVIEW_TRANSITION'
  | 'QUESTION_LOG_NOT_FOUND'
  | 'REVIEW_CONFLICT'
  | 'REVIEW_NOT_FOUND'
  | 'REVIEWS_UNAVAILABLE'
  | 'ROUTE_NOT_FOUND'
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
