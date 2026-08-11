export type TelegramFailureCode =
  | 'authentication_failed'
  | 'conflict'
  | 'invalid_response'
  | 'network_unavailable'
  | 'rate_limited'
  | 'request_rejected'
  | 'request_timeout'
  | 'service_unavailable';

export class TelegramApiError extends Error {
  constructor(
    readonly code: TelegramFailureCode,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

export function classifyTelegramFailure(error: unknown): 'fatal' | 'transient' {
  return error instanceof TelegramApiError && !error.transient ? 'fatal' : 'transient';
}

export function telegramSafeErrorCode(error: unknown): Exclude<TelegramFailureCode, 'invalid_response' | 'request_rejected'> | 'unknown' {
  if (!(error instanceof TelegramApiError)) return 'unknown';
  if (error.code === 'invalid_response' || error.code === 'request_rejected') return 'unknown';
  return error.code;
}

export function telegramHttpError(method: string, status: number): TelegramApiError {
  if (status === 401 || status === 403) {
    return new TelegramApiError('authentication_failed', `Telegram API ${method} authentication failed`, false);
  }
  if (status === 409) {
    return new TelegramApiError('conflict', `Telegram API ${method} has a polling conflict`, false);
  }
  if (status === 429) {
    return new TelegramApiError('rate_limited', `Telegram API ${method} is rate limited`, true);
  }
  if (status >= 500) {
    return new TelegramApiError('service_unavailable', `Telegram API ${method} is unavailable`, true);
  }
  return new TelegramApiError('request_rejected', `Telegram API ${method} rejected the request`, false);
}
