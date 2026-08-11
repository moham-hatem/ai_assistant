import { createLocalConfig } from '../../config.ts';
import { pathToFileURL } from 'node:url';
import { createRuntime } from '../../create-runtime.ts';
import {
  acquireRuntimeAdmission,
  type AdmissionLease,
} from '../../modules/backups/runtime-admission.ts';
import { TelegramHttpClient } from './client.ts';
import {
  createPairingCode,
  createPairingLink,
  SingleLearnerAccessPolicy,
} from './access-policy.ts';
import { createTelegramConfig } from './config.ts';
import { classifyTelegramFailure, telegramSafeErrorCode } from './errors.ts';
import { TelegramUpdateHandler } from './handler.ts';
import { TelegramHistory } from './history.ts';
import { TelegramPoller } from './poller.ts';
import { TelegramRateLimiter } from './rate-limit.ts';
import { TelegramStore } from './store.ts';
import { prepareTelegramBot } from './startup.ts';
import { acquireTelegramSingleton, type TelegramSingletonLease } from './singleton-admission.ts';
import { resolveTelegramRuntimeStatusPath } from './runtime-status.ts';
import { TelegramStatusReporter } from './status-reporter.ts';

export async function runTelegramBot(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<void> {
  const telegram = createTelegramConfig(env, cwd);
  const local = createLocalConfig({
    ...env,
    OPENCODE_TIMEOUT_MS: String(telegram.modelTimeoutMs),
  } as Record<string, string>, cwd);
  const reporter = new TelegramStatusReporter(resolveTelegramRuntimeStatusPath(env, cwd));
  let runtimeAdmission: AdmissionLease | undefined;
  let singleton: TelegramSingletonLease | undefined;
  let runtime: ReturnType<typeof createRuntime> | undefined;
  let store: TelegramStore | undefined;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let primaryError: unknown;
  try {
    runtimeAdmission = await acquireRuntimeAdmission(local.backupDirectory, { scope: 'telegram' });
    singleton = await acquireTelegramSingleton(local.backupDirectory);
    runtime = createRuntime(local);
    store = new TelegramStore(telegram.databaseFile, telegram.sessionSecret);
    const client = new TelegramHttpClient(telegram.botToken, telegram.httpTimeoutMs);
    const identity = await prepareTelegramBot(client, controller.signal);
    reporter.running(identity.username);
    console.info(`Telegram bot ready: ${identity.link}`);
    const pairingCode = createPairingCode();
    const accessPolicy = new SingleLearnerAccessPolicy(store, pairingCode);
    if (!store.authorizationExists()) {
      console.info(`Telegram closed-beta pairing link: ${createPairingLink(identity.username, pairingCode)}`);
    }
    const handler = new TelegramUpdateHandler(
      runtime.answerRequestService,
      client,
      store,
      new TelegramHistory(telegram.historyTtlMs),
      new TelegramRateLimiter(telegram.rateLimitCount, telegram.rateLimitWindowMs),
      accessPolicy,
      telegram.processingDeadlineMs,
    );
    let lastPollError = telegramSafeErrorCode(undefined);
    const poller = new TelegramPoller(client, handler, store, {
      classifyFailure: (error) => {
        lastPollError = telegramSafeErrorCode(error);
        return classifyTelegramFailure(error);
      },
      leaseMs: telegram.updateLeaseMs,
      onHeartbeat: ({ updateCount }) => reporter.heartbeat(updateCount),
      onStatus: (status) => {
        if (status.type === 'retrying' || status.type === 'fatal') {
          reporter.degraded(lastPollError, status.attempt);
        } else if (status.type === 'stopped') {
          reporter.degraded('service_unavailable', 0);
        }
      },
      pollTimeoutSeconds: telegram.pollTimeoutSeconds,
      retryDelayMs: telegram.retryDelayMs,
    });
    await poller.run(controller.signal);
  } catch (error) {
    primaryError = error;
    reporter.degraded(telegramSafeErrorCode(error), 0);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    const cleanupErrors: unknown[] = [];
    try { store?.close(); } catch (error) { cleanupErrors.push(error); }
    if (runtime) cleanupErrors.push(...closeRuntime(runtime));
    try { await reporter.flush(); } catch (error) { cleanupErrors.push(error); }
    try { await singleton?.release(); } catch (error) { cleanupErrors.push(error); }
    try { await runtimeAdmission?.release(); } catch (error) { cleanupErrors.push(error); }
    if (primaryError !== undefined && cleanupErrors.length === 0) throw primaryError;
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
    const cause = error instanceof AggregateError ? error.cause : error;
    const code = telegramSafeErrorCode(cause);
    console.error(code === 'unknown'
      ? (error instanceof Error ? error.message : 'Telegram bot failed to start')
      : `Telegram bot stopped (${code}).`);
    process.exitCode = 1;
  });
}
