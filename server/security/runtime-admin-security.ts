import type { AdminRequestAuthorizer } from './admin-request-authorizer.ts';
import { unauthenticated } from './admin-request-authorizer.ts';
import type { AdminApiSecurity } from './admin-authorization-guard.ts';
import { SameOriginRequestGuard } from './same-origin-request-guard.ts';

class UnconfiguredAdminRequestAuthorizer implements AdminRequestAuthorizer {
  async authorize(): Promise<never> {
    throw unauthenticated();
  }
}

/** Secure runtime boundary until the authentication core supplies an adapter. */
export function createRuntimeAdminSecurity(): AdminApiSecurity {
  return {
    authorizer: new UnconfiguredAdminRequestAuthorizer(),
    originGuard: new SameOriginRequestGuard(),
  };
}
