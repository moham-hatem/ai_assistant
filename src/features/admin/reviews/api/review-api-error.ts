export class ReviewsApiError extends Error {
  readonly code: string;
  readonly requestId: string | null;
  readonly status: number | null;

  constructor(
    message: string,
    options: { code?: string; requestId?: string | null; status?: number | null } = {},
  ) {
    super(message);
    this.name = 'ReviewsApiError';
    this.code = options.code ?? 'INVALID_RESPONSE';
    this.requestId = options.requestId ?? null;
    this.status = options.status ?? null;
  }
}
