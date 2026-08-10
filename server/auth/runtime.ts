import { createAuthCookiePolicy } from './cookie.ts';
import type { AuthConfig } from './config.ts';
import { createAuthHandler, type AuthErrorLogger } from './http-handler.ts';
import { SameOriginAuthPolicy } from './origin.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';
import { AccessService } from './access-service.ts';
import { createAccessHandler } from './access-http-handler.ts';
import type { SecurityAuditService } from '../modules/security-audit/service.ts';

export async function createLocalAuthRuntime(
  config: AuthConfig,
  logError: AuthErrorLogger = () => undefined,
  audit?: SecurityAuditService,
) {
  const repository = new SqliteAuthRepository(config.databasePath);
  try {
    const service = await createAuthService(
      repository,
      new ScryptPasswordHasher(),
      new InMemoryLoginRateLimiter(),
      { absoluteTtlMs: config.absoluteTtlMs, idleTtlMs: config.idleTtlMs },
      { audit },
    );
    if (audit) {
      try { await repository.flushSecurityAuditOutbox(audit); }
      catch (error) { logError('security-audit-startup', error); }
    }
    const cookie = createAuthCookiePolicy(config);
    const origin = new SameOriginAuthPolicy(config.publicOrigin);
    const accessService = new AccessService(
      repository,
      new ScryptPasswordHasher(),
      new InMemoryLoginRateLimiter(10, 15 * 60_000),
      {
        invitationTtlMs: 24 * 60 * 60_000,
        publicOrigin: config.publicOrigin,
        recoveryTtlMs: 60 * 60_000,
      },
      undefined,
      undefined,
      undefined,
      audit,
    );
    return {
      accessHandler: createAccessHandler(accessService, origin, logError),
      accessService,
      cookie,
      handler: createAuthHandler(service, cookie, origin, config.absoluteTtlMs, logError),
      origin,
      repository,
      service,
    };
  } catch (error) {
    repository.close();
    throw error;
  }
}
