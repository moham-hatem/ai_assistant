import type { TelegramHttpClient } from './client.ts';
import type { TelegramStore } from './store.ts';
import type { TelegramUpdate } from './types.ts';

type UpdateSource = Pick<TelegramHttpClient, 'getUpdates'>;
type UpdateHandler = { handle(update: TelegramUpdate, signal?: AbortSignal): Promise<void> };

interface PollerOptions {
  classifyFailure?: PollingFailureClassifier;
  jitterRatio?: number;
  leaseMs: number;
  maximumRetryDelayMs?: number;
  now?: () => number;
  onHeartbeat?: (heartbeat: TelegramPollerHeartbeat) => void;
  onStatus?: (status: TelegramPollerStatus) => void;
  pollTimeoutSeconds: number;
  random?: () => number;
  retryDelayMs: number;
}

export type PollingFailureDisposition = 'fatal' | 'transient';
export type PollingFailureClassifier = (error: unknown) => PollingFailureDisposition;

export interface TelegramPollerHeartbeat {
  at: number;
  offset?: number;
  updateCount: number;
}

export type TelegramPollerStatus =
  | { at: number; type: 'running' }
  | { at: number; attempt: number; delayMs: number; type: 'retrying' }
  | { at: number; attempt: number; type: 'fatal' }
  | { at: number; type: 'stopped' };

export class TelegramPoller {
  private readonly client: UpdateSource;
  private readonly handler: UpdateHandler;
  private readonly options: PollerOptions;
  private offset: number | undefined;
  private readonly store: TelegramStore;

  constructor(
    client: UpdateSource,
    handler: UpdateHandler,
    store: TelegramStore,
    options: PollerOptions,
  ) {
    this.client = client;
    this.handler = handler;
    this.store = store;
    this.options = options;
  }

  async run(signal: AbortSignal): Promise<void> {
    let consecutiveFailures = 0;
    this.emitStatus({ at: this.now(), type: 'running' });
    try {
      while (!signal.aborted) {
        try {
          const updateCount = await this.pollOnce(signal);
          consecutiveFailures = 0;
          this.emitHeartbeat({
            at: this.now(),
            ...(this.offset === undefined ? {} : { offset: this.offset }),
            updateCount,
          });
        } catch (error) {
          if (signal.aborted) return;
          consecutiveFailures += 1;
          if (this.classifyFailure(error) === 'fatal') {
            this.emitStatus({ at: this.now(), attempt: consecutiveFailures, type: 'fatal' });
            throw error;
          }
          const delayMs = this.retryDelay(consecutiveFailures);
          this.emitStatus({
            at: this.now(), attempt: consecutiveFailures, delayMs, type: 'retrying',
          });
          await abortableDelay(delayMs, signal);
        }
      }
    } finally {
      this.emitStatus({ at: this.now(), type: 'stopped' });
    }
  }

  async pollOnce(signal?: AbortSignal): Promise<number> {
    const updates = await this.client.getUpdates(
      this.offset,
      this.options.pollTimeoutSeconds,
      signal,
    );
    for (const update of [...updates].sort((left, right) => left.updateId - right.updateId)) {
      const claim = this.store.claimUpdate(update.updateId, this.options.leaseMs);
      if (claim === 'busy') return updates.length;
      if (claim === 'completed') {
        this.offset = update.updateId + 1;
        continue;
      }
      try {
        await this.handler.handle(update, signal);
        this.store.completeUpdate(update.updateId);
        this.offset = update.updateId + 1;
      } catch (error) {
        this.store.releaseUpdate(update.updateId);
        throw error;
      }
    }
    return updates.length;
  }

  currentOffset(): number | undefined {
    return this.offset;
  }

  private classifyFailure(error: unknown): PollingFailureDisposition {
    return this.options.classifyFailure?.(error) ?? 'transient';
  }

  private emitHeartbeat(heartbeat: TelegramPollerHeartbeat): void {
    try { this.options.onHeartbeat?.(heartbeat); }
    catch { /* Observability hooks must not interrupt polling. */ }
  }

  private emitStatus(status: TelegramPollerStatus): void {
    try { this.options.onStatus?.(status); }
    catch { /* Observability hooks must not interrupt polling. */ }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private retryDelay(attempt: number): number {
    const base = positiveInteger(this.options.retryDelayMs, 'retryDelayMs');
    const maximum = positiveInteger(
      this.options.maximumRetryDelayMs ?? Math.max(base, 30_000),
      'maximumRetryDelayMs',
    );
    if (maximum < base) throw new Error('maximumRetryDelayMs must be at least retryDelayMs');
    const jitterRatio = this.options.jitterRatio ?? 0.2;
    if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) {
      throw new Error('jitterRatio must be between 0 and 1');
    }
    const exponent = Math.min(Math.max(attempt - 1, 0), 30);
    const capped = Math.min(base * (2 ** exponent), maximum);
    const random = this.options.random?.() ?? Math.random();
    const boundedRandom = Number.isFinite(random) ? Math.min(Math.max(random, 0), 1) : 0;
    return Math.max(1, Math.round(capped * (1 - (jitterRatio * boundedRandom))));
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
