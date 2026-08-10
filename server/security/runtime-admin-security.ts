import type { AuthCookiePolicy } from '../auth/cookie.ts';
import type { AuthOriginPolicy } from '../auth/origin.ts';
import type { AuthService } from '../auth/service.ts';
import type { AdminApiSecurity } from './admin-authorization-guard.ts';
import { AuthServiceAdminRequestAuthorizer } from './auth-service-admin-request-authorizer.ts';
import { SameOriginRequestGuard } from './same-origin-request-guard.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';

export function createRuntimeAdminSecurity(
  service: AuthService,
  cookie: AuthCookiePolicy,
  origin: AuthOriginPolicy,
  audit?: SecurityAuditService,
): AdminApiSecurity {
  return {
    authorizer: new AuthServiceAdminRequestAuthorizer(service, cookie),
    originGuard: new SameOriginRequestGuard(origin),
    audit,
  };
}
