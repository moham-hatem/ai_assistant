import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { AuthPermission, AuthPrincipal } from '../../shared/contracts/auth.ts';
import { sendJson } from '../http/json.ts';
import { forbidden, unauthenticated } from '../security/admin-request-authorizer.ts';
import type { AdminApiSecurity } from '../security/admin-authorization-guard.ts';
import { createLocalApiRequestHandler, type LocalApiHandlers } from './local-api.ts';
import { SecurityAuditService } from '../modules/security-audit/service.ts';
import { UnavailableSecurityAuditRepository } from '../modules/security-audit/unavailable-repository.ts';
import { SqliteSecurityAuditRepository } from '../modules/security-audit/sqlite-repository.ts';

test('rejected admin requests never reach handlers and return stable sanitized errors', async () => {
  const fixture = createFixture({ captureAudit: true });
  try { await withServer(fixture, async (baseUrl) => {
    for (const authorization of [undefined, 'Bearer invalid']) {
      const response = await fetch(`${baseUrl}/api/internal/books`, {
        headers: authorization ? { authorization } : undefined,
      });
      assert.equal(response.status, 401);
      assertStableError(await response.json(), 'UNAUTHENTICATED', 'Authentication is required.');
    }

    const forbiddenResponse = await fetch(`${baseUrl}/api/internal/books`, {
      headers: { authorization: 'Bearer limited' },
    });
    assert.equal(forbiddenResponse.status, 403);
    const forbiddenBody = await forbiddenResponse.json() as { requestId: string };
    assertStableError(forbiddenBody, 'FORBIDDEN', 'Permission denied.');

    assert.deepEqual(fixture.calls.handlers, {});
    assert.equal(fixture.calls.next, 0);
    const events = await fixture.audit!.list({ action: 'authorization.denied', limit: 10, offset: 0 });
    const authenticatedDenial = events.items.find((event) => event.requestId === forbiddenBody.requestId);
    assert.equal(authenticatedDenial?.actorUserId, principal.id);
    assert.equal(fixture.calls.requestIds.at(-1), forbiddenBody.requestId);
  }); } finally { fixture.auditRepository?.close(); }
});

test('unknown internal and document operations are denied before dispatch', async () => {
  const fixture = createFixture();
  await withServer(fixture, async (baseUrl) => {
    const requests = [
      fetch(`${baseUrl}/api/internal/future-operation`, {
        headers: { authorization: 'Bearer admin' },
      }),
      fetch(`${baseUrl}/api/knowledge/documents/document-id/preview`, {
        headers: { authorization: 'Bearer admin' },
      }),
      fetch(`${baseUrl}/api/knowledge/documents`, {
        method: 'PUT',
        body: '{not-json',
        headers: { authorization: 'Bearer admin', 'content-type': 'application/json' },
      }),
    ];

    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 403);
      assertStableError(await response.json(), 'FORBIDDEN', 'Permission denied.');
    }
    assert.deepEqual(fixture.calls.handlers, {});
  });
});

test('document resources require authorization and rejected bodies are not handled', async () => {
  const fixture = createFixture();
  await withServer(fixture, async (baseUrl) => {
    const resource = await fetch(`${baseUrl}/api/knowledge/documents/document-id/source`);
    assert.equal(resource.status, 401);

    const upload = await fetch(`${baseUrl}/api/knowledge/documents?name=book.pdf`, {
      method: 'POST',
      body: Buffer.from('document bytes that must not reach the handler'),
    });
    assert.equal(upload.status, 401);

    assert.equal(fixture.calls.handlers.documents, undefined);
    assert.equal(fixture.calls.origins, 0);
  });
});

test('authorized requests use the mapped permission and origin guard before handlers', async () => {
  const fixture = createFixture();
  await withServer(fixture, async (baseUrl) => {
    const read = await fetch(`${baseUrl}/api/internal/question-logs`, {
      headers: { authorization: 'Bearer admin' },
    });
    assert.equal(read.status, 204);

    const write = await fetch(`${baseUrl}/api/internal/reviews/review-id/decision`, {
      method: 'POST',
      body: '{}',
      headers: {
        authorization: 'Bearer admin',
        origin: baseUrl,
        'content-type': 'application/json',
      },
    });
    assert.equal(write.status, 204);

    assert.deepEqual(fixture.calls.permissions, ['question_logs:read', 'content:review']);
    assert.equal(fixture.calls.origins, 1);
    assert.deepEqual(fixture.calls.handlers, { questionLogs: 1, reviews: 1 });
  });
});

test('origin rejection occurs before a state-changing handler', async () => {
  const fixture = createFixture({ captureAudit: true, rejectOrigin: true });
  try { await withServer(fixture, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/internal/books`, {
      method: 'POST',
      body: '{not-json',
      headers: { authorization: 'Bearer admin', origin: 'https://attacker.example' },
    });

    assert.equal(response.status, 403);
    const body = await response.json() as { requestId: string };
    assertStableError(body, 'FORBIDDEN', 'Permission denied.');
    assert.equal(fixture.calls.origins, 1);
    assert.equal(fixture.calls.handlers.books, undefined);
    const events = await fixture.audit!.list({ action: 'authorization.denied', limit: 10, offset: 0 });
    assert.equal(events.total, 1);
    assert.equal(events.items[0]?.actorUserId, principal.id);
    assert.equal(events.items[0]?.requestId, body.requestId);
    assert.equal(fixture.calls.requestIds[0], body.requestId);
  }); } finally { fixture.auditRepository?.close(); }
});

test('public APIs bypass admin authorization and continue to their handlers or next middleware', async () => {
  const fixture = createFixture({ auditUnavailable: true });
  await withServer(fixture, async (baseUrl) => {
    const requests = [
      fetch(`${baseUrl}/api/answer-question`, { method: 'POST' }),
      fetch(`${baseUrl}/api/feedback`, { method: 'POST' }),
      fetch(`${baseUrl}/api/meta/version`),
      fetch(`${baseUrl}/api/version`),
      fetch(`${baseUrl}/api/auth/session`),
    ];
    for (const response of await Promise.all(requests)) assert.equal(response.status, 204);

    assert.deepEqual(fixture.calls.handlers, { answer: 1, feedback: 1, version: 1 });
    assert.equal(fixture.calls.next, 2);
    assert.deepEqual(fixture.calls.permissions, []);
    assert.equal(fixture.calls.origins, 0);
  });
});

test('auth routes run before the admin guard and remain public', async () => {
  const fixture = createFixture();
  const authHandler = async (
    _request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ) => {
    if (pathname !== '/api/auth/session') return false;
    sendJson(response, 200, { principal: null, requestId: 'auth-request' });
    return true;
  };
  const requestHandler = createLocalApiRequestHandler(
    fixture.handlers,
    fixture.security,
    () => undefined,
    authHandler,
  );
  await withServer({
    ...fixture,
    listener(request: IncomingMessage, response: ServerResponse) {
      void requestHandler(request, response, () => {
        fixture.calls.next += 1;
        response.statusCode = 204;
        response.end();
      });
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { principal: null }).principal, null);
  });
  assert.deepEqual(fixture.calls.permissions, []);
  assert.equal(fixture.calls.next, 0);
});

interface FixtureOptions {
  auditUnavailable?: boolean;
  captureAudit?: boolean;
  rejectOrigin?: boolean;
}

function createFixture(options: FixtureOptions = {}) {
  const calls: {
    handlers: Partial<Record<keyof LocalApiHandlers, number>>;
    next: number;
    origins: number;
    permissions: AuthPermission[];
    requestIds: string[];
  } = { handlers: {}, next: 0, origins: 0, permissions: [], requestIds: [] };

  const handler = (name: keyof LocalApiHandlers) => (
    _request: IncomingMessage,
    response: ServerResponse,
  ) => {
    calls.handlers[name] = (calls.handlers[name] ?? 0) + 1;
    response.statusCode = 204;
    response.end();
  };
  const handlers: LocalApiHandlers = {
    access: handler('access'),
    answer: handler('answer'),
    books: handler('books'),
    documents: handler('documents'),
    feedback: handler('feedback'),
    qualityMetrics: handler('qualityMetrics'),
    questionLogs: handler('questionLogs'),
    reviews: handler('reviews'),
    version: handler('version'),
  };
  const auditRepository = options.captureAudit ? new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  ) : undefined;
  const audit = options.auditUnavailable
    ? new SecurityAuditService(new UnavailableSecurityAuditRepository())
    : auditRepository ? new SecurityAuditService(auditRepository) : undefined;
  const security: AdminApiSecurity = {
    audit,
    authorizer: {
      async authorize(request, permission, requestId) {
        calls.permissions.push(permission);
        calls.requestIds.push(requestId);
        const authorization = request.headers.authorization;
        if (!authorization || authorization === 'Bearer invalid') throw unauthenticated();
        if (authorization === 'Bearer limited') {
          throw forbidden(principal);
        }
        return principal;
      },
    },
    originGuard: {
      async assertAllowed() {
        calls.origins += 1;
        if (options.rejectOrigin) throw forbidden();
      },
    },
  };
  const requestHandler = createLocalApiRequestHandler(handlers, security, () => undefined);

  return {
    audit,
    auditRepository,
    calls,
    handlers,
    listener(request: IncomingMessage, response: ServerResponse) {
      void requestHandler(request, response, () => {
        calls.next += 1;
        response.statusCode = 204;
        response.end();
      }).catch((error) => sendJson(response, 500, { error: String(error) }));
    },
    security,
  };
}

const principal: AuthPrincipal = {
  displayName: 'Admin User',
  email: 'admin@example.test',
  id: 'admin-1',
  permissions: [
    'books:read',
    'books:write',
    'content:review',
    'question_logs:read',
    'quality:read',
    'settings:manage',
  ],
  roles: ['admin'],
};

async function withServer(
  fixture: ReturnType<typeof createFixture>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(fixture.listener);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function assertStableError(value: unknown, code: string, message: string): void {
  assert.equal(typeof value, 'object');
  assert.ok(value);
  const body = value as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['code', 'message', 'requestId']);
  assert.equal(body.code, code);
  assert.equal(body.message, message);
  assert.match(String(body.requestId), /^[0-9a-f-]{36}$/u);
}
