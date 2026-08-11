import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { TelegramStore } from './store.ts';

export interface TelegramAccessPolicy {
  authorize(sessionKey: string, startPayload?: string): TelegramAccessDecision;
  isAuthorized(sessionKey: string): boolean;
}

export type TelegramAccessDecision = 'authorized' | 'paired' | 'denied';

export const closedTelegramAccessPolicy: TelegramAccessPolicy = {
  authorize: () => 'denied',
  isAuthorized: () => false,
};

export class SingleLearnerAccessPolicy implements TelegramAccessPolicy {
  constructor(
    private readonly store: TelegramStore,
    private readonly pairingCode: string,
  ) {}

  authorize(sessionKey: string, startPayload?: string): TelegramAccessDecision {
    if (this.store.isAuthorized(sessionKey)) return 'authorized';
    if (!startPayload || !matchesSecret(startPayload, this.pairingCode)) return 'denied';
    const claim = this.store.claimSoleAuthorization(sessionKey);
    return claim === 'claimed' || claim === 'authorized' ? 'paired' : 'denied';
  }

  isAuthorized(sessionKey: string): boolean {
    return this.store.isAuthorized(sessionKey);
  }
}

export function createPairingCode(): string {
  return randomBytes(24).toString('base64url');
}

export function createPairingLink(username: string, pairingCode: string): string {
  if (!/^[A-Za-z0-9_]{5,32}$/u.test(username)) {
    throw new Error('Telegram bot username is invalid.');
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(pairingCode)) {
    throw new Error('Telegram pairing code is invalid.');
  }
  return `https://t.me/${username}?start=${pairingCode}`;
}

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length
    && timingSafeEqual(candidateBytes, expectedBytes);
}
