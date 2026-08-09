export class InvalidAccessInputError extends Error {}
export class AccessTokenRejectedError extends Error {}

export class AccessRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many token redemption attempts.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
