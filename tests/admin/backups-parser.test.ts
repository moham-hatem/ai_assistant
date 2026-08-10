import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBackupCreate, parseBackupList, parseBackupValidation } from '../../src/features/admin/backups/api/backup-parser.ts';

const summary = {
  appVersion: '0.1.0', artifactBytes: 120, artifactSha256: 'a'.repeat(64),
  createdAt: '2026-08-10T12:00:00.000Z', fileCount: 3, formatVersion: 1,
  id: '11111111-1111-4111-8111-111111111111', totalBytes: 240,
};

test('backup parsers accept the exact versioned contracts', () => {
  assert.deepEqual(parseBackupList({ backups: [summary], requestId: 'request-1' }), [summary]);
  assert.deepEqual(parseBackupCreate({ backup: summary, requestId: 'request-2' }), summary);
  assert.deepEqual(parseBackupValidation({
    requestId: 'request-3',
    validation: {
      checkedAt: '2026-08-10T12:01:00.000Z', fileCount: 3,
      id: summary.id, status: 'valid', totalBytes: 240,
    },
  }), {
    checkedAt: '2026-08-10T12:01:00.000Z', fileCount: 3,
    id: summary.id, status: 'valid', totalBytes: 240,
  });
});

test('backup parsers reject extra data, broken checksums, duplicates, and unsupported versions', () => {
  assert.throws(() => parseBackupList({ backups: [], requestId: 'ok', secret: 'must reject' }));
  assert.throws(() => parseBackupList({ backups: [summary, summary], requestId: 'ok' }));
  assert.throws(() => parseBackupCreate({
    backup: { ...summary, artifactSha256: 'bad' }, requestId: 'ok',
  }));
  assert.throws(() => parseBackupCreate({
    backup: { ...summary, formatVersion: 2 }, requestId: 'ok',
  }));
  assert.throws(() => parseBackupValidation({
    requestId: 'ok', validation: {
      checkedAt: 'not-a-time', fileCount: 3, id: summary.id, status: 'valid', totalBytes: 240,
    },
  }));
});
