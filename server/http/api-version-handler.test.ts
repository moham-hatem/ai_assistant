import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { API_VERSION_CONTRACT } from '../../shared/contracts/api-version.ts';
import { handleApiVersionRequest } from './api-version-handler.ts';

test('version endpoint returns only the public compatibility contract with safe headers', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/meta/version`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(await response.json(), API_VERSION_CONTRACT);
  });
});

test('version endpoint rejects every non-GET method without reflecting request details', async () => {
  const secret = 'private-path-and-secret-value';
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/meta/version?token=${secret}`, {
      body: secret,
      method: 'POST',
    });
    const body = await response.text();

    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(JSON.parse(body), { code: 'METHOD_NOT_ALLOWED' });
    assert.equal(body.includes(secret), false);
    assert.equal(body.toLowerCase().includes('stack'), false);

    for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      const rejected = await fetch(`${baseUrl}/api/meta/version`, { method });
      assert.equal(rejected.status, 405, method);
      assert.equal(rejected.headers.get('allow'), 'GET', method);
      assert.equal(rejected.headers.get('cache-control'), 'no-store', method);
      assert.equal(rejected.headers.get('x-content-type-options'), 'nosniff', method);
    }
  });
});

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    handleApiVersionRequest(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
