import type { TelegramSafeErrorCode } from '../../../shared/contracts/system-diagnostics.ts';
import {
  writeTelegramRuntimeStatus,
  type TelegramRuntimeStatusUpdate,
} from './runtime-status.ts';

export class TelegramStatusReporter {
  private pending: Promise<void> = Promise.resolve();
  private snapshot: TelegramRuntimeStatusUpdate = {
    configured: true,
    errorCode: 'service_unavailable',
    retryCount: 0,
    state: 'degraded',
  };

  constructor(private readonly path: string) {}

  running(username: string): void {
    this.update({
      configured: true,
      publicUsername: username,
      retryCount: 0,
      state: 'running',
    });
  }

  heartbeat(updateCount: number): void {
    const now = new Date().toISOString();
    this.update({
      lastSuccessfulPoll: now,
      ...(updateCount > 0 ? { lastHandledUpdateAt: now } : {}),
      retryCount: 0,
      state: 'running',
    });
  }

  degraded(errorCode: TelegramSafeErrorCode, retryCount: number): void {
    this.update({ errorCode, retryCount, state: 'degraded' });
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  private update(patch: Partial<TelegramRuntimeStatusUpdate>): void {
    const { errorCode: _previousError, ...withoutError } = this.snapshot;
    this.snapshot = patch.state === 'running'
      ? { ...withoutError, ...patch } as TelegramRuntimeStatusUpdate
      : { ...this.snapshot, ...patch } as TelegramRuntimeStatusUpdate;
    const selected = { ...this.snapshot };
    this.pending = this.pending
      .catch(() => undefined)
      .then(() => writeTelegramRuntimeStatus(this.path, selected));
  }
}
