import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_BACKUP_CONTENT_TYPE } from '../../shared/contracts/backups.ts';
import { createBackup, downloadBackup, validateBackup } from '../../src/features/admin/backups/api/backups.ts';

const summary = {
  appVersion: '0.1.0', artifactBytes: 12, artifactSha256: 'b'.repeat(64),
  createdAt: '2026-08-10T12:00:00.000Z', fileCount: 2, formatVersion: 1,
  id: '11111111-1111-4111-8111-111111111111', totalBytes: 25,
};

test('mutating backup clients use exact POST routes with same-origin credentials and no restore endpoint', async () => {
  const original = globalThis.fetch;
  const calls: Array<{ init?: RequestInit; input: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ init, input: String(input) });
    if (String(input).endsWith('/validate')) return json({
      requestId: 'request-2', validation: {
        checkedAt: '2026-08-10T12:01:00.000Z', fileCount: 2,
        id: summary.id, status: 'valid', totalBytes: 25,
      },
    });
    return json({ backup: summary, requestId: 'request-1' }, 201);
  }) as typeof fetch;
  try {
    await createBackup();
    await validateBackup(summary.id);
    assert.deepEqual(calls.map((call) => ({
      body: call.init?.body, credentials: call.init?.credentials,
      input: call.input, method: call.init?.method,
    })), [
      { body: undefined, credentials: 'same-origin', input: '/api/internal/backups', method: 'POST' },
      { body: undefined, credentials: 'same-origin', input: `/api/internal/backups/${summary.id}/validate`, method: 'POST' },
    ]);
    assert.equal(calls.some((call) => call.input.includes('/restore')), false);
  } finally {
    globalThis.fetch = original;
  }
});

test('download client requires the exact safe content type and attachment filename', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Blob(['backup-bytes']), {
    headers: {
      'content-disposition': 'attachment; filename="safe-backup.ilabackup"',
      'content-type': LOCAL_BACKUP_CONTENT_TYPE,
    },
  })) as typeof fetch;
  try {
    const result = await downloadBackup(summary.id);
    assert.equal(result.fileName, 'safe-backup.ilabackup');
    assert.equal(await result.blob.text(), 'backup-bytes');
  } finally {
    globalThis.fetch = original;
  }
});

test('backup client exposes stable error codes without trusting server messages', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => json({ code: 'BACKUP_UNAVAILABLE', message: 'secret detail' }, 503)) as typeof fetch;
  try {
    await assert.rejects(createBackup(), (error: unknown) => {
      assert.equal((error as Error).message, 'BACKUP_UNAVAILABLE');
      assert.equal((error as Error).message.includes('secret detail'), false);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }, status,
  });
}
