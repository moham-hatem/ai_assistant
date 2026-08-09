interface Window {
  count: number;
  startedAt: number;
}

export class TelegramRateLimiter {
  private readonly limit: number;
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, Window>();

  constructor(
    limit: number,
    windowMs: number,
    now: () => number = Date.now,
  ) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  allow(sessionKey: string): boolean {
    const now = this.now();
    const current = this.windows.get(sessionKey);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(sessionKey, { count: 1, startedAt: now });
      return true;
    }
    if (current.count >= this.limit) return false;
    current.count += 1;
    return true;
  }
}
