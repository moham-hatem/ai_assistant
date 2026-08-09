import type { IncomingMessage } from 'node:http';

export interface AuthOriginPolicy {
  allows(request: IncomingMessage): boolean;
}

export class SameOriginAuthPolicy implements AuthOriginPolicy {
  private readonly allowedOrigin: string;

  constructor(publicOrigin: string) {
    this.allowedOrigin = new URL(publicOrigin).origin;
  }

  allows(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin.length > 512 || origin === 'null') return false;
    try {
      return new URL(origin).origin === this.allowedOrigin && new URL(origin).href === `${this.allowedOrigin}/`;
    } catch {
      return false;
    }
  }
}
