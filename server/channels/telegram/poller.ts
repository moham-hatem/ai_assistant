import type { TelegramHttpClient } from './client.ts';
import type { TelegramStore } from './store.ts';
import type { TelegramUpdate } from './types.ts';

type UpdateSource = Pick<TelegramHttpClient, 'getUpdates'>;
type UpdateHandler = { handle(update: TelegramUpdate, signal?: AbortSignal): Promise<void> };

interface PollerOptions {
  leaseMs: number;
  pollTimeoutSeconds: number;
  retryDelayMs: number;
}

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
    while (!signal.aborted) {
      try {
        await this.pollOnce(signal);
      } catch {
        if (signal.aborted) return;
        await abortableDelay(this.options.retryDelayMs, signal);
      }
    }
  }

  async pollOnce(signal?: AbortSignal): Promise<void> {
    const updates = await this.client.getUpdates(
      this.offset,
      this.options.pollTimeoutSeconds,
      signal,
    );
    for (const update of [...updates].sort((left, right) => left.updateId - right.updateId)) {
      const claim = this.store.claimUpdate(update.updateId, this.options.leaseMs);
      if (claim === 'busy') return;
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
  }

  currentOffset(): number | undefined {
    return this.offset;
  }
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
