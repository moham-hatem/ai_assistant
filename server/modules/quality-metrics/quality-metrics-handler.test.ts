import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { createQualityMetricsHandler } from './quality-metrics-handler.ts';
import { parseQualityMetricsQuery } from './quality-metrics-query.ts';
import type { QualityMetricsRepository } from './quality-metrics-repository.ts';
import { QualityMetricsService } from './quality-metrics-service.ts';
import { SqliteQualityMetricsRepository } from './sqlite-quality-metrics-repository.ts';
import { createQualityMetricsFixture } from './quality-metrics-test-fixture.ts';

test('quality metrics handler returns aggregates and metadata without sensitive rows', async () => {
  const fixture = await createQualityMetricsFixture();
  const repository = new SqliteQualityMetricsRepository(fixture.path);
  const service = new QualityMetricsService(repository, () => new Date('2026-08-09T12:00:00.000Z'));
  const handler = createQualityMetricsHandler(service, () => undefined);
  try {
    await withServer(handler, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/internal/quality-metrics?from=2026-08-01T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z&language=en&channel=web`);
      const payload = await response.json() as Record<string, unknown>;
      const serialized = JSON.stringify(payload);
      assert.equal(response.status, 200);
      assert.equal(payload.generatedAt, '2026-08-09T12:00:00.000Z');
      assert.match(String(payload.requestId), /^[0-9a-f-]{36}$/u);
      for (const sensitive of [
        'private-question', 'private-answer', 'private-comment', 'private-reviewer', 'q1', 'evidence',
      ]) assert.equal(serialized.includes(sensitive), false);
    });
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test('quality metrics query rejects unknown, duplicate, invalid, and reversed filters', () => {
  const invalidQueries = [
    '?book=1',
    '?language=en&language=ar',
    '?language=',
    '?channel=web%20chat',
    '?from=2026-08-01',
    '?from=2026-02-30T00%3A00%3A00Z',
    '?from=2026-08-08T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z',
    '?from=2026-08-09T00%3A00%3A00Z&to=2026-08-08T00%3A00%3A00Z',
  ];
  for (const query of invalidQueries) {
    const url = new URL(`/api/internal/quality-metrics${query}`, 'http://localhost');
    assert.throws(() => parseQualityMetricsQuery(url));
  }
});

test('unavailable metrics return a sanitized 502 and writes are rejected', async () => {
  const unavailable: QualityMetricsRepository = {
    read: async () => { throw new Error('private database path'); },
  };
  const handler = createQualityMetricsHandler(new QualityMetricsService(unavailable), () => undefined);
  await withServer(handler, async (baseUrl) => {
    const unavailableResponse = await fetch(`${baseUrl}/api/internal/quality-metrics`);
    const unavailableBody = await unavailableResponse.text();
    assert.equal(unavailableResponse.status, 502);
    assert.equal(unavailableBody.includes('private database path'), false);
    const writeResponse = await fetch(`${baseUrl}/api/internal/quality-metrics`, { method: 'POST' });
    assert.equal(writeResponse.status, 405);
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
