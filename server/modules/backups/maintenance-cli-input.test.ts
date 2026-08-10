import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMaintenanceCliInput, restoreConfirmation } from './maintenance-cli-input.ts';

const id = '11111111-1111-4111-8111-111111111111';
const artifactSha256 = 'ab'.repeat(32);

test('maintenance CLI parsing is preview-first and accepts only local backup identities', () => {
  assert.deepEqual(parseMaintenanceCliInput(['restore', '--backup', `${id}.ilabackup`]), {
    apply: false, backupId: id, command: 'restore', confirmation: undefined,
  });
  assert.deepEqual(parseMaintenanceCliInput([
    'restore', '--backup', id, '--apply', '--confirm', restoreConfirmation(id, artifactSha256),
  ]), {
    apply: true, backupId: id, command: 'restore', confirmation: restoreConfirmation(id, artifactSha256),
  });
  assert.deepEqual(parseMaintenanceCliInput(['retention', '--keep', '7']), {
    apply: false, command: 'retention', confirmation: undefined, keepCount: 7,
  });
});

test('maintenance CLI rejects paths, duplicates, unknown flags, and unsafe retention counts', () => {
  for (const args of [
    ['restore', '--backup', `../${id}`],
    ['restore', '--backup', `C:\\outside\\${id}.ilabackup`],
    ['restore', '--backup', id, '--backup', id],
    ['restore', '--backup', id, '--restore-live'],
    ['retention', '--keep', '0'],
    ['retention', '--keep', '1', '--unknown', 'value'],
  ]) assert.throws(() => parseMaintenanceCliInput(args));
});

test('restore confirmation changes with the selected artifact checksum', () => {
  assert.notEqual(restoreConfirmation(id, 'a'.repeat(64)), restoreConfirmation(id, 'b'.repeat(64)));
});
