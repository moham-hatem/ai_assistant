import { createAuthCookiePolicy } from './cookie.ts';
import type { AuthConfig } from './config.ts';
import { createAuthHandler, type AuthErrorLogger } from './http-handler.ts';
import { SameOriginAuthPolicy } from './origin.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

export async function createLocalAuthRuntime(
  config: AuthConfig,
  logError: AuthErrorLogger = () => undefined,
) {
  const repository = new SqliteAuthRepository(config.databasePath);
  try {
    const service = await createAuthService(
      repository,
      new ScryptPasswordHasher(),
      new InMemoryLoginRateLimiter(),
      { absoluteTtlMs: config.absoluteTtlMs, idleTtlMs: config.idleTtlMs },
    );
    const cookie = createAuthCookiePolicy(config);
    const origin = new SameOriginAuthPolicy(config.publicOrigin);
    return {
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
