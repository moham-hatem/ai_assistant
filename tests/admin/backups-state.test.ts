import assert from 'node:assert/strict';
import test from 'node:test';
import { backupsReducer, createBackupsState, type BackupsState } from '../../src/features/admin/backups/backup-state.ts';
import type { BackupSummary } from '../../shared/contracts/backups.ts';

const older = backup('11111111-1111-4111-8111-111111111111', '2026-08-10T10:00:00.000Z');
const created = backup('22222222-2222-4222-8222-222222222222', '2026-08-10T12:00:00.000Z');

test('a stale list response cannot hide a backup created while refresh was in flight', () => {
  let state = createBackupsState();
  state = backupsReducer(state, { loadId: 1, mutationVersion: 0, type: 'load-started' });
  state = backupsReducer(state, { backups: [older], loadId: 1, type: 'loaded' });
  state = backupsReducer(state, { type: 'retry' });
  state = backupsReducer(state, { loadId: 2, mutationVersion: 0, type: 'load-started' });
  state = backupsReducer(state, {
    operation: { backupId: null, id: 7, kind: 'create' }, type: 'operation-started',
  });
  state = backupsReducer(state, { backup: created, operationId: 7, type: 'created' });
  state = backupsReducer(state, { backups: [older], loadId: 2, type: 'loaded' });
  assert.deepEqual(state.backups.map((item) => item.id), [created.id, older.id]);
});

test('load and operation identities ignore stale completions', () => {
  let state = createBackupsState();
  state = backupsReducer(state, { loadId: 3, mutationVersion: 0, type: 'load-started' });
  state = backupsReducer(state, { loadId: 4, mutationVersion: 0, type: 'load-started' });
  const unchanged = backupsReducer(state, { backups: [older], loadId: 3, type: 'loaded' });
  assert.strictEqual(unchanged, state);

  state = backupsReducer(state, {
    operation: { backupId: created.id, id: 8, kind: 'validate' }, type: 'operation-started',
  });
  assert.strictEqual(backupsReducer(state, { operationId: 7, type: 'operation-failed' }), state);
  state = backupsReducer(state, {
    operationId: 8, type: 'validated', validation: {
      checkedAt: '2026-08-10T12:05:00.000Z', fileCount: 1,
      id: created.id, status: 'valid', totalBytes: 20,
    },
  });
  assert.equal(state.validatedAt[created.id], '2026-08-10T12:05:00.000Z');
  assert.equal(state.operation, null);
});

test('a refresh started after creation can authoritatively replace the local list', () => {
  let state = createBackupsState();
  state = backupsReducer(state, {
    operation: { backupId: null, id: 1, kind: 'create' }, type: 'operation-started',
  });
  state = backupsReducer(state, { backup: created, operationId: 1, type: 'created' });
  state = backupsReducer(state, {
    loadId: 5, mutationVersion: state.mutationVersion, type: 'load-started',
  });
  state = backupsReducer(state, { backups: [older], loadId: 5, type: 'loaded' });
  assert.deepEqual(state.backups, [older]);
});

test('refresh failure preserves the last safe backup list', () => {
  let state: BackupsState = { ...createBackupsState(), backups: [older], loadStatus: 'ready' };
  state = backupsReducer(state, {
    loadId: 6, mutationVersion: state.mutationVersion, type: 'load-started',
  });
  state = backupsReducer(state, { loadId: 6, type: 'load-failed' });
  assert.deepEqual(state.backups, [older]);
  assert.equal(state.loadStatus, 'ready');
  assert.equal(state.notice, 'failed');
});

function backup(id: string, createdAt: string): BackupSummary {
  return {
    appVersion: 'test', artifactBytes: 10, artifactSha256: 'a'.repeat(64),
    createdAt, fileCount: 1, formatVersion: 1, id, totalBytes: 20,
  };
}
