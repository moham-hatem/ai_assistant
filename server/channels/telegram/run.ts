import { createLocalConfig } from '../../config.ts';
import { createRuntime } from '../../create-runtime.ts';
import { TelegramHttpClient } from './client.ts';
import { createTelegramConfig } from './config.ts';
import { TelegramUpdateHandler } from './handler.ts';
import { TelegramHistory } from './history.ts';
import { TelegramPoller } from './poller.ts';
import { TelegramRateLimiter } from './rate-limit.ts';
import { TelegramStore } from './store.ts';

export async function runTelegramBot(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<void> {
  const telegram = createTelegramConfig(env, cwd);
  const runtime = createRuntime(createLocalConfig(env as Record<string, string>, cwd));
  const store = new TelegramStore(telegram.databaseFile, telegram.sessionSecret);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    const client = new TelegramHttpClient(telegram.botToken, telegram.httpTimeoutMs);
    const handler = new TelegramUpdateHandler(
      runtime.answerRequestService,
      client,
      store,
      new TelegramHistory(telegram.historyTtlMs),
      new TelegramRateLimiter(telegram.rateLimitCount, telegram.rateLimitWindowMs),
    );
    const poller = new TelegramPoller(client, handler, store, {
      leaseMs: telegram.updateLeaseMs,
      pollTimeoutSeconds: telegram.pollTimeoutSeconds,
      retryDelayMs: telegram.retryDelayMs,
    });
    await poller.run(controller.signal);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    store.close();
    closeRuntime(runtime);
  }
}

function closeRuntime(runtime: ReturnType<typeof createRuntime>): void {
  const closed = new Set<object>();
  for (const value of Object.values(runtime)) {
    if (!value || typeof value !== 'object' || closed.has(value)) continue;
    const close = (value as { close?: () => void }).close;
    if (typeof close === 'function') {
      close.call(value);
      closed.add(value);
    }
  }
}

runTelegramBot().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Telegram bot failed to start');
  process.exitCode = 1;
});
