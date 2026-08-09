import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { createAuthCookiePolicy } from './cookie.ts';
import { createAuthHandler } from './http-handler.ts';
import { SameOriginAuthPolicy } from './origin.ts';
import { ScryptPasswordHasher } from './password.ts';
import { InMemoryLoginRateLimiter } from './rate-limit.ts';
import { createAuthService } from './service.ts';
import { SqliteAuthRepository } from './sqlite-repository.ts';

const publicOrigin = 'http://app.local.test';

test('auth HTTP contract uses unified login errors, strict origin, and opaque cookies', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({
    cost: 1_024,
    keyLength: 32,
    maxMemory: 4 * 1024 * 1024,
  });
  await repository.createUser({
    displayName: 'Local Reviewer',
    email: 'reviewer@example.org',
    id: 'user-1',
    passwordHash: await passwords.hash('correct secure password'),
    roles: ['reviewer'],
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  const service = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(50, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 30_000 },
    { tokenFactory: () => 't'.repeat(43) },
  );
  const cookiePolicy = createAuthCookiePolicy({ production: false, publicOrigin });
  const handler = createAuthHandler(
    service,
    cookiePolicy,
    new SameOriginAuthPolicy(publicOrigin),
    60_000,
  );

  await withServer(handler, async (baseUrl) => {
    const crossSite = await postJson(`${baseUrl}/api/auth/login`, {
      email: 'reviewer@example.org', password: 'correct secure password',
    }, 'http://evil.test');
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.headers.get('set-cookie'), null);

    const missing = await postJson(`${baseUrl}/api/auth/login`, {
      email: 'missing@example.org', password: 'correct secure password',
    });
    const wrong = await postJson(`${baseUrl}/api/auth/login`, {
      email: 'reviewer@example.org', password: 'incorrect secure password',
    });
    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal((await missing.json() as { code: string }).code, 'INVALID_CREDENTIALS');
    assert.equal((await wrong.json() as { code: string }).code, 'INVALID_CREDENTIALS');

    const login = await postJson(`${baseUrl}/api/auth/login`, {
      email: 'reviewer@example.org', password: 'correct secure password',
    });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    assert.equal(login.headers.get('x-content-type-options'), 'nosniff');
    const loginBody = await login.json() as {
      principal: { displayName: string; id: string };
      requestId: string;
    };
    assert.equal(loginBody.principal.id, 'user-1');
    assert.equal(loginBody.principal.displayName, 'Local Reviewer');
    assert.equal(typeof loginBody.requestId, 'string');
    const setCookie = login.headers.get('set-cookie')!;
    assert.match(setCookie, /^ila_local_session=/u);
    assert.equal(setCookie.includes('HttpOnly'), true);
    assert.equal(setCookie.includes('SameSite=Strict'), true);
    assert.equal(setCookie.includes('Secure'), false);
    const cookie = setCookie.split(';', 1)[0];

    const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal((await session.json() as { principal: { id: string } }).principal.id, 'user-1');

    const rejectedLogout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'http://evil.test' },
    });
    assert.equal(rejectedLogout.status, 403);
    const stillActive = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.equal((await stillActive.json() as { principal: { id: string } }).principal.id, 'user-1');

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: cookie, Origin: publicOrigin },
    });
    assert.equal(logout.status, 204);
    assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/u);
    const ended = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    assert.equal((await ended.json() as { principal: null }).principal, null);
  });
  repository.close();
});

async function postJson(url: string, body: object, origin = publicOrigin): Promise<Response> {
  return await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: origin },
    method: 'POST',
  });
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse, pathname: string) => Promise<boolean>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    void handler(request, response, pathname).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
