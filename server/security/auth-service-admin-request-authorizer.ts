import type { IncomingMessage } from 'node:http';
import type { AuthPermission, AuthPrincipal } from '../../shared/contracts/auth.ts';
import { readSessionCookie, type AuthCookiePolicy } from '../auth/cookie.ts';
import type { AuthService } from '../auth/service.ts';
import {
  forbidden,
  type AdminRequestAuthorizer,
  unauthenticated,
} from './admin-request-authorizer.ts';

export class AuthServiceAdminRequestAuthorizer implements AdminRequestAuthorizer {
  private readonly service: AuthService;
  private readonly cookie: AuthCookiePolicy;

  constructor(
    service: AuthService,
    cookie: AuthCookiePolicy,
  ) {
    this.service = service;
    this.cookie = cookie;
  }

  async authorize(
    request: IncomingMessage,
    permission: AuthPermission,
    requestId: string,
  ): Promise<AuthPrincipal> {
    const principal = await this.service.getPrincipal(
      readSessionCookie(request.headers, this.cookie),
      requestId,
    );
    if (!principal) throw unauthenticated();
    if (!principal.permissions.includes(permission)) throw forbidden(principal);
    return principal;
  }
}
