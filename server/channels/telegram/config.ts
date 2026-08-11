import { resolve } from 'node:path';

export interface TelegramConfig {
  botToken: string;
  databaseFile: string;
  historyTtlMs: number;
  httpTimeoutMs: number;
  modelTimeoutMs: number;
  pollTimeoutSeconds: number;
  processingDeadlineMs: number;
  rateLimitCount: number;
  rateLimitWindowMs: number;
  retryDelayMs: number;
  sessionSecret: string;
  updateLeaseMs: number;
}

export function createTelegramConfig(
  env: Record<string, string | undefined>,
  cwd: string,
): TelegramConfig {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const sessionSecret = env.TELEGRAM_SESSION_SECRET?.trim();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!sessionSecret) throw new Error('TELEGRAM_SESSION_SECRET is required');
  if (sessionSecret.length < 32) {
    throw new Error('TELEGRAM_SESSION_SECRET must contain at least 32 characters');
  }
  const config: TelegramConfig = {
    botToken,
    databaseFile: resolve(cwd, env.TELEGRAM_DATABASE_FILE?.trim() || 'data/telegram.sqlite'),
    historyTtlMs: boundedInteger(env.TELEGRAM_HISTORY_TTL_MS, 30 * 60_000, 24 * 60 * 60_000, 60_000),
    httpTimeoutMs: boundedInteger(env.TELEGRAM_HTTP_TIMEOUT_MS, 40_000, 120_000, 1_000),
    modelTimeoutMs: boundedInteger(env.TELEGRAM_MODEL_TIMEOUT_MS, 15_000, 60_000, 5_000),
    pollTimeoutSeconds: boundedInteger(env.TELEGRAM_POLL_TIMEOUT_SECONDS, 30, 50, 1),
    processingDeadlineMs: boundedInteger(
      env.TELEGRAM_PROCESSING_DEADLINE_MS, 130_000, 10 * 60_000, 5_000,
    ),
    rateLimitCount: boundedInteger(env.TELEGRAM_RATE_LIMIT_COUNT, 5, 100, 1),
    rateLimitWindowMs: boundedInteger(env.TELEGRAM_RATE_LIMIT_WINDOW_MS, 60_000, 60 * 60_000, 1_000),
    retryDelayMs: boundedInteger(env.TELEGRAM_RETRY_DELAY_MS, 1_000, 30_000, 50),
    sessionSecret,
    updateLeaseMs: boundedInteger(env.TELEGRAM_UPDATE_LEASE_MS, 150_000, 15 * 60_000, 5_000),
  };
  validateTelegramTimings(config);
  return config;
}

export function validateTelegramTimings(
  config: Pick<TelegramConfig,
    'httpTimeoutMs' | 'pollTimeoutSeconds' | 'processingDeadlineMs' | 'updateLeaseMs'>,
): void {
  const safetyMarginMs = 5_000;
  const minimumHttpTimeout = (config.pollTimeoutSeconds * 1_000) + safetyMarginMs;
  if (config.httpTimeoutMs <= minimumHttpTimeout) {
    throw new Error(
      'TELEGRAM_HTTP_TIMEOUT_MS must exceed the long-poll timeout by more than 5000ms',
    );
  }
  if (config.updateLeaseMs <= config.processingDeadlineMs + safetyMarginMs) {
    throw new Error(
      'TELEGRAM_UPDATE_LEASE_MS must exceed the processing deadline by more than 5000ms',
    );
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): number {
  const normalized = value?.trim() ?? '';
  const parsed = /^-?\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}
