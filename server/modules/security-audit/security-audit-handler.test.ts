import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSecurityAuditHandler } from './security-audit-handler.ts';
import { SecurityAuditService } from './service.ts';
import { SqliteSecurityAuditRepository } from './sqlite-repository.ts';

test('admin audit API strictly filters, paginates, and returns integrity summary', async () => {
  const repository = new SqliteSecurityAuditRepository(
    ':memory:', new Map([['v1', randomBytes(32)]]), 'v1',
  );
  const service = new SecurityAuditService(repository);
  await service.recordNew({
    action: 'authorization.denied', actorUserId: null, category: 'authorization',
    metadata: { method: 'POST', permission: 'books:write', reason: 'forbidden' },
    outcome: 'denied', requestId: randomUUID(), subjectId: null, subjectType: null,
  });
  const handler = createSecurityAuditHandler(service, () => undefined);
  const server = createServer((request, response) => {
    void handler(request, response, new URL(request.url ?? '/', 'http://localhost'));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind.');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const list = await fetch(`${base}/api/internal/security-audit?outcome=denied&limit=1`);
    assert.equal(list.status, 200);
    assert.equal(((await list.json()) as { total: number }).total, 1);
    assert.equal((await fetch(`${base}/api/internal/security-audit?unknown=value`)).status, 400);
    const integrity = await fetch(`${base}/api/internal/security-audit/integrity`);
    assert.equal(((await integrity.json()) as { integrity: { status: string } }).integrity.status, 'valid');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    repository.close();
  }
});
