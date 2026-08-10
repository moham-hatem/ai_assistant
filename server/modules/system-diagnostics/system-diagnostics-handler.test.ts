import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import type { SystemDiagnosticsReport } from '../../../shared/contracts/system-diagnostics.ts';
import { createSystemDiagnosticsHandler } from './system-diagnostics-handler.ts';

const report: SystemDiagnosticsReport = {
  checkedAt: '2026-08-10T12:30:00.000Z',
  checks: [],
  status: 'healthy',
  versions: { api: '1', app: '0.1.0' },
};

test('system diagnostics handler exposes only GET without query parameters', async () => {
  const service = { inspect: async () => report };
  const handler = createSystemDiagnosticsHandler(service, () => undefined);
  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/internal/system-diagnostics`);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.deepEqual(body.diagnostics, report);
    assert.match(String(body.requestId), /^[0-9a-f-]{36}$/u);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    const queryResponse = await fetch(`${baseUrl}/api/internal/system-diagnostics?verbose=true`);
    assert.equal(queryResponse.status, 400);
    const writeResponse = await fetch(`${baseUrl}/api/internal/system-diagnostics`, { method: 'POST' });
    assert.equal(writeResponse.status, 405);
    assert.equal(writeResponse.headers.get('allow'), 'GET');
  });
});

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void handler(request, response, new URL(request.url ?? '/', 'http://localhost'));
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
