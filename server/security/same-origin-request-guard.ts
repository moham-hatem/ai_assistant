import type { IncomingMessage } from 'node:http';
import type { StateChangingRequestOriginGuard } from './admin-request-authorizer.ts';
import { forbidden } from './admin-request-authorizer.ts';

export class SameOriginRequestGuard implements StateChangingRequestOriginGuard {
  async assertAllowed(request: IncomingMessage): Promise<void> {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (!origin || !host || request.headers['sec-fetch-site'] === 'cross-site') throw forbidden();

    let parsedOrigin: URL;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw forbidden();
    }

    const encrypted = 'encrypted' in request.socket && request.socket.encrypted === true;
    const protocol = encrypted ? 'https:' : 'http:';
    if (parsedOrigin.protocol !== protocol || parsedOrigin.host !== host) throw forbidden();
  }
}
