import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { AppError } from '../errors.ts';
import { sendJson } from '../http/json.ts';
import type { AdminPermission } from '../security/admin-request-authorizer.ts';
import { forbidden, unauthenticated } from '../security/admin-request-authorizer.ts';
import type { AdminApiSecurity } from '../security/admin-authorization-guard.ts';
import { createLocalApiRequestHandler, type LocalApiHandlers } from './local-api.ts';

test('rejected admin requests never reach handlers and return stable sanitized errors', async () => {
  const fixture = createFixture();
  await withServer(fixture, async (baseUrl) => {
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
    assertStableError(await forbiddenResponse.json(), 'FORBIDDEN', 'Permission denied.');

    assert.deepEqual(fixture.calls.handlers, {});
    assert.equal(fixture.calls.next, 0);
  });
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
  const fixture = createFixture({ rejectOrigin: true });
  await withServer(fixture, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/internal/books`, {
      method: 'POST',
      body: '{not-json',
      headers: { authorization: 'Bearer admin', origin: 'https://attacker.example' },
    });

    assert.equal(response.status, 403);
    assertStableError(await response.json(), 'FORBIDDEN', 'Permission denied.');
    assert.equal(fixture.calls.origins, 1);
    assert.equal(fixture.calls.handlers.books, undefined);
  });
});

test('public APIs bypass admin authorization and continue to their handlers or next middleware', async () => {
  const fixture = createFixture();
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

interface FixtureOptions {
  rejectOrigin?: boolean;
}

function createFixture(options: FixtureOptions = {}) {
  const calls: {
    handlers: Partial<Record<keyof LocalApiHandlers, number>>;
    next: number;
    origins: number;
    permissions: AdminPermission[];
  } = { handlers: {}, next: 0, origins: 0, permissions: [] };

  const handler = (name: keyof LocalApiHandlers) => (
    _request: IncomingMessage,
    response: ServerResponse,
  ) => {
    calls.handlers[name] = (calls.handlers[name] ?? 0) + 1;
    response.statusCode = 204;
    response.end();
  };
  const handlers: LocalApiHandlers = {
    answer: handler('answer'),
    books: handler('books'),
    documents: handler('documents'),
    feedback: handler('feedback'),
    qualityMetrics: handler('qualityMetrics'),
    questionLogs: handler('questionLogs'),
    reviews: handler('reviews'),
    version: handler('version'),
  };
  const security: AdminApiSecurity = {
    authorizer: {
      async authorize(request, permission) {
        calls.permissions.push(permission);
        const authorization = request.headers.authorization;
        if (!authorization || authorization === 'Bearer invalid') throw unauthenticated();
        if (authorization === 'Bearer limited') {
          throw new AppError('INVALID_REQUEST', 'secret adapter detail', 403);
        }
        return { subject: 'admin-1' };
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
    calls,
    listener(request: IncomingMessage, response: ServerResponse) {
      void requestHandler(request, response, () => {
        calls.next += 1;
        response.statusCode = 204;
        response.end();
      }).catch((error) => sendJson(response, 500, { error: String(error) }));
    },
  };
}

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
