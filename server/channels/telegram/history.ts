import type { ChatTurn } from '../../domain.ts';

interface Entry {
  expiresAt: number;
  turns: ChatTurn[];
}

export class TelegramHistory {
  private readonly entries = new Map<string, Entry>();
  private readonly maximumTurns: number;
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(
    ttlMs: number,
    maximumTurns = 8,
    now: () => number = Date.now,
  ) {
    this.ttlMs = ttlMs;
    this.maximumTurns = maximumTurns;
    this.now = now;
  }

  get(sessionKey: string): ChatTurn[] {
    const entry = this.entries.get(sessionKey);
    if (!entry || entry.expiresAt <= this.now()) {
      this.entries.delete(sessionKey);
      return [];
    }
    return entry.turns.map((turn) => ({ ...turn }));
  }

  append(sessionKey: string, turns: ChatTurn[]): void {
    const current = this.get(sessionKey);
    this.entries.set(sessionKey, {
      expiresAt: this.now() + this.ttlMs,
      turns: [...current, ...turns].slice(-this.maximumTurns),
    });
  }

  clear(sessionKey: string): void {
    this.entries.delete(sessionKey);
  }
}
