import { createLocalConfig } from '../../config.ts';
import { pathToFileURL } from 'node:url';
import { createRuntime } from '../../create-runtime.ts';
import { acquireRuntimeAdmission } from '../../modules/backups/runtime-admission.ts';
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
  const local = createLocalConfig(env as Record<string, string>, cwd);
  const runtimeAdmission = await acquireRuntimeAdmission(local.backupDirectory, { scope: 'telegram' });
  let runtime: ReturnType<typeof createRuntime> | undefined;
  let store: TelegramStore | undefined;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let primaryError: unknown;
  try {
    runtime = createRuntime(local);
    store = new TelegramStore(telegram.databaseFile, telegram.sessionSecret);
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
  } catch (error) {
    primaryError = error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    const cleanupErrors: unknown[] = [];
    try { store?.close(); } catch (error) { cleanupErrors.push(error); }
    if (runtime) cleanupErrors.push(...closeRuntime(runtime));
    try { await runtimeAdmission.release(); } catch (error) { cleanupErrors.push(error); }
    if (primaryError !== undefined || cleanupErrors.length > 0) {
      throw new AggregateError(
        primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors],
        primaryError === undefined ? 'Telegram cleanup failed.' : 'Telegram polling failed.',
        primaryError === undefined ? undefined : { cause: primaryError },
      );
    }
  }
}

function closeRuntime(runtime: ReturnType<typeof createRuntime>): unknown[] {
  const closed = new Set<object>();
  const errors: unknown[] = [];
  for (const value of Object.values(runtime)) {
    if (!value || typeof value !== 'object' || closed.has(value)) continue;
    const close = (value as { close?: () => void }).close;
    if (typeof close === 'function') {
      try { close.call(value); } catch (error) { errors.push(error); }
      closed.add(value);
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTelegramBot().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Telegram bot failed to start');
    process.exitCode = 1;
  });
}
