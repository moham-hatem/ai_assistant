import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import { createAccessHandler } from '../auth/access-http-handler.ts';
import { AccessService } from '../auth/access-service.ts';
import { createAuthCookiePolicy } from '../auth/cookie.ts';
import { createAuthHandler } from '../auth/http-handler.ts';
import { SameOriginAuthPolicy } from '../auth/origin.ts';
import { ScryptPasswordHasher } from '../auth/password.ts';
import { InMemoryLoginRateLimiter } from '../auth/rate-limit.ts';
import { createAuthService } from '../auth/service.ts';
import { SqliteAuthRepository } from '../auth/sqlite-repository.ts';
import { createRuntimeAdminSecurity } from '../security/runtime-admin-security.ts';
import { createLocalApiRequestHandler, type LocalApiHandlers } from './local-api.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';

const publicOrigin = 'http://app.local.test';

test('local access API enforces settings permission and origin without leaking secrets', async () => {
  const repository = new SqliteAuthRepository(':memory:');
  const passwords = new ScryptPasswordHasher({
    cost: 1_024, keyLength: 32, maxMemory: 4 * 1024 * 1024,
  });
  const auditRepository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const audit = new SecurityAuditService(auditRepository);
  await createUser(repository, passwords, 'admin-1', 'admin@example.org', ['admin']);
  await createUser(repository, passwords, 'reviewer-1', 'reviewer@example.org', ['reviewer']);
  let sessionNumber = 0;
  const auth = await createAuthService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(50, 60_000),
    { absoluteTtlMs: 60_000, idleTtlMs: 30_000 },
    { tokenFactory: () => String(++sessionNumber).padStart(43, 's') },
  );
  const origin = new SameOriginAuthPolicy(publicOrigin);
  const cookie = createAuthCookiePolicy({ production: false, publicOrigin });
  const access = new AccessService(
    repository,
    passwords,
    new InMemoryLoginRateLimiter(20, 60_000),
    { invitationTtlMs: 60_000, publicOrigin, recoveryTtlMs: 60_000 },
    undefined,
    () => 'i'.repeat(43),
    () => 'invitation-1',
    audit,
  );
  const handler = createLocalApiRequestHandler(
    createHandlers(createAccessHandler(access, origin)),
    createRuntimeAdminSecurity(auth, cookie, origin, audit),
    () => undefined,
    createAuthHandler(auth, cookie, origin, 60_000),
  );

  try {
    await withServer(handler, async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/api/internal/access/users`);
      assert.equal(anonymous.status, 401);

      const reviewerCookie = await login(baseUrl, 'reviewer@example.org');
      const forbidden = await fetch(`${baseUrl}/api/internal/access/users`, {
        headers: { Cookie: reviewerCookie },
      });
      assert.equal(forbidden.status, 403);

      const adminCookie = await login(baseUrl, 'admin@example.org');
      const invalidPage = await fetch(`${baseUrl}/api/internal/access/users?limit=101`, {
        headers: { Cookie: adminCookie },
      });
      assert.equal(invalidPage.status, 400);
      const body = {
        displayName: 'Invited Operator', email: 'invitee@example.org', roles: ['operator'],
      };
      const wrongOrigin = await postJson(
        `${baseUrl}/api/internal/access/invitations`, body, adminCookie, 'http://evil.test',
      );
      assert.equal(wrongOrigin.status, 403);

      const extraField = await postJson(
        `${baseUrl}/api/internal/access/invitations`,
        { ...body, unexpected: true },
        adminCookie,
        publicOrigin,
      );
      assert.equal(extraField.status, 400);

      const created = await postJson(
        `${baseUrl}/api/internal/access/invitations`, body, adminCookie, publicOrigin,
      );
      assert.equal(created.status, 201);
      const createdRequestId = created.headers.get('x-request-id');
      const createdText = await created.text();
      const invitation = JSON.parse(createdText) as {
        link: string;
        requestId: string;
        warning: string;
      };
      assert.equal(invitation.requestId, createdRequestId);
      const createdEvents = await audit.list({
        action: 'access.invitation_created', limit: 10, offset: 0,
      });
      assert.equal(createdEvents.items[0]?.requestId, createdRequestId);
      assert.equal(createdEvents.items[0]?.actorUserId, 'admin-1');
      assert.equal(invitation.link.includes('i'.repeat(43)), true);
      assertSecretOnlyInFragment(invitation.link, 'invitation', 'i'.repeat(43));
      assert.equal(createdText.includes('tokenHash'), false);
      assert.equal(createdText.includes('passwordHash'), false);

      const existingEmail = await postJson(
        `${baseUrl}/api/internal/access/invitations`,
        { ...body, email: 'admin@example.org' },
        adminCookie,
        publicOrigin,
      );
      assert.equal(existingEmail.status, 409);
      const conflictText = await existingEmail.text();
      assert.equal(conflictText.includes('admin@example.org'), false);
      assert.equal(
        (JSON.parse(conflictText) as { code: string }).code,
        'ACCESS_OPERATION_REJECTED',
      );

      const list = await fetch(`${baseUrl}/api/internal/access/users?limit=1`, {
        headers: { Cookie: adminCookie },
      });
      assert.equal(list.status, 200);
      const listText = await list.text();
      assert.equal(listText.includes('passwordHash'), false);
      assert.equal(listText.includes('tokenHash'), false);

      const crossOriginRedeem = await postJson(
        `${baseUrl}/api/auth/invitations/redeem`,
        { password: 'invited secure password', token: 'i'.repeat(43) },
        undefined,
        'http://evil.test',
      );
      assert.equal(crossOriginRedeem.status, 403);
      const oversized = await postJson(
        `${baseUrl}/api/auth/invitations/redeem`,
        { password: 'p'.repeat(5_000), token: 'i'.repeat(43) },
        undefined,
        publicOrigin,
      );
      assert.equal(oversized.status, 400);
      const redeemed = await postJson(
        `${baseUrl}/api/auth/invitations/redeem`,
        { password: 'invited secure password', token: 'i'.repeat(43) },
        undefined,
        publicOrigin,
      );
      assert.equal(redeemed.status, 204);
      const redeemedRequestId = redeemed.headers.get('x-request-id');
      const redeemedEvents = await audit.list({
        action: 'access.invitation_redeemed', limit: 10, offset: 0,
      });
      assert.equal(redeemedEvents.items[0]?.requestId, redeemedRequestId);
      assert.equal(redeemedEvents.items[0]?.actorUserId, null);
      assert.equal(redeemedEvents.items[0]?.subjectType, 'user');
      const invitedCookie = await login(baseUrl, 'invitee@example.org', 'invited secure password');
      assert.ok(invitedCookie);

      const repeated = await postJson(
        `${baseUrl}/api/auth/invitations/redeem`,
        { password: 'another secure password', token: 'i'.repeat(43) },
        undefined,
        publicOrigin,
      );
      assert.equal(repeated.status, 400);
      assert.equal((await repeated.json() as { code: string }).code, 'INVALID_OR_EXPIRED_TOKEN');

      const recovery = await postJson(
        `${baseUrl}/api/internal/access/users/reviewer-1/recovery`,
        {},
        adminCookie,
        publicOrigin,
      );
      assert.equal(recovery.status, 201);
      const recoveryBody = await recovery.json() as { link: string };
      assertSecretOnlyInFragment(recoveryBody.link, 'recovery', 'i'.repeat(43));
      const recoveryToken = secretFromFragment(recoveryBody.link, 'recovery');
      const recovered = await postJson(
        `${baseUrl}/api/auth/recovery/redeem`,
        { password: 'reviewer replacement password', token: recoveryToken },
        undefined,
        publicOrigin,
      );
      assert.equal(recovered.status, 204);
      assert.ok(await login(
        baseUrl, 'reviewer@example.org', 'reviewer replacement password',
      ));
    });
  } finally {
    repository.close();
    auditRepository.close();
  }
});

function createHandlers(access: LocalApiHandlers['access']): LocalApiHandlers {
  const empty = (_request: IncomingMessage, response: ServerResponse) => {
    response.statusCode = 204;
    response.end();
  };
  return {
    access,
    answer: empty,
    books: empty,
    documents: empty,
    feedback: empty,
    qualityMetrics: empty,
    questionLogs: empty,
    reviews: empty,
    version: empty,
  };
}

async function createUser(
  repository: SqliteAuthRepository,
  passwords: ScryptPasswordHasher,
  id: string,
  email: string,
  roles: Array<'admin' | 'reviewer'>,
): Promise<void> {
  await repository.createUser({
    displayName: id,
    email,
    id,
    passwordHash: await passwords.hash('initial secure password'),
    roles,
    timestamp: '2026-01-01T00:00:00.000Z',
  });
}

async function login(
  baseUrl: string,
  email: string,
  password = 'initial secure password',
): Promise<string> {
  const response = await postJson(
    `${baseUrl}/api/auth/login`, { email, password }, undefined, publicOrigin,
  );
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie')!.split(';', 1)[0];
}

async function postJson(
  url: string,
  body: object,
  cookie: string | undefined,
  origin: string,
): Promise<Response> {
  return await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: origin,
    },
    method: 'POST',
  });
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

function assertSecretOnlyInFragment(
  link: string,
  parameter: string,
  expectedToken: string,
): void {
  const url = new URL(link);
  assert.equal(url.origin, publicOrigin);
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(secretFromFragment(link, parameter), expectedToken);
  const requestUrl = new URL(url);
  requestUrl.hash = '';
  assert.equal(requestUrl.href, `${publicOrigin}/`);
  assert.equal(requestUrl.href.includes(expectedToken), false);
}

function secretFromFragment(link: string, parameter: string): string | null {
  const query = new URL(link).hash.split('?', 2)[1] ?? '';
  return new URLSearchParams(query).get(parameter);
}
