import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import { createAuthCookiePolicy } from '../auth/cookie.ts';
import { createAuthHandler } from '../auth/http-handler.ts';
import { SameOriginAuthPolicy } from '../auth/origin.ts';
import { ScryptPasswordHasher } from '../auth/password.ts';
import { InMemoryLoginRateLimiter } from '../auth/rate-limit.ts';
import { createAuthService } from '../auth/service.ts';
import { SqliteAuthRepository } from '../auth/sqlite-repository.ts';
import { createRuntimeAdminSecurity } from '../security/runtime-admin-security.ts';
import { createLocalApiRequestHandler, type LocalApiHandlers } from './local-api.ts';

const publicOrigin = 'http://app.local.test';

test('local API exposes public auth and enforces session permissions and trusted origin', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({
    cost: 1_024,
    keyLength: 32,
    maxMemory: 4 * 1024 * 1024,
  });
  await repository.createUser({
    displayName: 'Local Reviewer',
    email: 'reviewer@example.test',
    id: 'reviewer-1',
    passwordHash: await passwords.hash('correct secure password'),
    roles: ['reviewer'],
    timestamp: '2026-08-09T00:00:00.000Z',
  });
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(),
    { absoluteTtlMs: 60_000, idleTtlMs: 30_000 },
    { tokenFactory: () => 's'.repeat(43) },
  );
  const cookie = createAuthCookiePolicy({ production: false, publicOrigin });
  const origin = new SameOriginAuthPolicy(publicOrigin);
  const seenPrincipals: Array<AuthPrincipal | null> = [];
  const handlers = createHandlers(seenPrincipals);
  const handler = createLocalApiRequestHandler(
    handlers,
    createRuntimeAdminSecurity(service, cookie, origin),
    () => undefined,
    createAuthHandler(service, cookie, origin, 60_000),
  );

  try {
    await withServer(handler, async (baseUrl) => {
      const session = await fetch(`${baseUrl}/api/auth/session`);
      assert.equal(session.status, 200);
      assert.equal((await session.json() as { principal: null }).principal, null);

      const anonymous = await fetch(`${baseUrl}/api/internal/reviews`);
      assert.equal(anonymous.status, 401);

      const login = await fetch(`${baseUrl}/api/auth/login`, {
        body: JSON.stringify({
          email: 'reviewer@example.test',
          password: 'correct secure password',
        }),
        headers: { 'Content-Type': 'application/json', Origin: publicOrigin },
        method: 'POST',
      });
      assert.equal(login.status, 200);
      const sessionCookie = login.headers.get('set-cookie')?.split(';', 1)[0];
      assert.ok(sessionCookie);

      const missingPermission = await fetch(`${baseUrl}/api/internal/books`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(missingPermission.status, 403);

      const crossOriginWrite = await fetch(`${baseUrl}/api/internal/reviews/review-1/decision`, {
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
          Origin: 'http://attacker.example',
        },
        method: 'POST',
      });
      assert.equal(crossOriginWrite.status, 403);

      const permitted = await fetch(`${baseUrl}/api/internal/reviews`, {
        headers: { Cookie: sessionCookie },
      });
      assert.equal(permitted.status, 204);
      assert.equal(seenPrincipals.at(-1)?.id, 'reviewer-1');
      assert.equal(seenPrincipals.length, 1);
    });
  } finally {
    repository.close();
  }
});

function createHandlers(seenPrincipals: Array<AuthPrincipal | null>): LocalApiHandlers {
  const empty = (_request: IncomingMessage, response: ServerResponse) => {
    response.statusCode = 204;
    response.end();
  };
  return {
    access: empty,
    answer: empty,
    books: empty,
    documents: empty,
    feedback: empty,
    qualityMetrics: empty,
    questionLogs: empty,
    reviews: (_request, response, _url, principal) => {
      seenPrincipals.push(principal);
      response.statusCode = 204;
      response.end();
    },
    version: empty,
  };
}

async function withServer(
  handler: ReturnType<typeof createLocalApiRequestHandler>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void handler(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
