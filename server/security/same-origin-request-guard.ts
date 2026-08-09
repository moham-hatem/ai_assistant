import type { IncomingMessage } from 'node:http';
import type { AuthOriginPolicy } from '../auth/origin.ts';
import type { StateChangingRequestOriginGuard } from './admin-request-authorizer.ts';
import { forbidden } from './admin-request-authorizer.ts';

export class SameOriginRequestGuard implements StateChangingRequestOriginGuard {
  private readonly policy: AuthOriginPolicy;

  constructor(policy: AuthOriginPolicy) {
    this.policy = policy;
  }

  async assertAllowed(request: IncomingMessage): Promise<void> {
    if (request.headers['sec-fetch-site'] === 'cross-site' || !this.policy.allows(request)) {
      throw forbidden();
    }
  }
}
