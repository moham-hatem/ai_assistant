import type { AuthCookiePolicy } from '../auth/cookie.ts';
import type { AuthOriginPolicy } from '../auth/origin.ts';
import type { AuthService } from '../auth/service.ts';
import type { AdminApiSecurity } from './admin-authorization-guard.ts';
import { AuthServiceAdminRequestAuthorizer } from './auth-service-admin-request-authorizer.ts';
import { SameOriginRequestGuard } from './same-origin-request-guard.ts';

export function createRuntimeAdminSecurity(
  service: AuthService,
  cookie: AuthCookiePolicy,
  origin: AuthOriginPolicy,
): AdminApiSecurity {
  return {
    authorizer: new AuthServiceAdminRequestAuthorizer(service, cookie),
    originGuard: new SameOriginRequestGuard(origin),
  };
}
