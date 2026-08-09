export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiter {
  check(key: string, nowMs: number): Promise<RateLimitDecision>;
}

export class InMemoryLoginRateLimiter implements LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly limit: number;
  private readonly maxKeys: number;
  private readonly windowMs: number;

  constructor(limit = 5, windowMs = 15 * 60_000, maxKeys = 10_000) {
    if (limit < 1 || windowMs < 1 || maxKeys < 1) {
      throw new Error('Invalid rate-limit configuration.');
    }
    this.limit = limit;
    this.maxKeys = maxKeys;
    this.windowMs = windowMs;
  }

  async check(key: string, nowMs: number): Promise<RateLimitDecision> {
    if (!this.attempts.has(key) && this.attempts.size >= this.maxKeys) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.attempts.delete(oldestKey);
    }
    const cutoff = nowMs - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + this.windowMs - nowMs) / 1_000)),
      };
    }
    recent.push(nowMs);
    this.attempts.set(key, recent);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
