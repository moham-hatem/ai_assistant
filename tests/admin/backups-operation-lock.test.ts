import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupOperationLock } from '../../src/features/admin/backups/operation-lock.ts';

test('backup operation lock rejects duplicate actions until the active request settles', async () => {
  const lock = createBackupOperationLock();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = lock.run(async () => { await pending; return 'complete'; });
  assert.equal(lock.isActive(), true);
  assert.deepEqual(await lock.run(async () => 'duplicate'), { started: false });
  release();
  assert.deepEqual(await first, { started: true, value: 'complete' });
  assert.equal(lock.isActive(), false);
  assert.deepEqual(await lock.run(async () => 'next'), { started: true, value: 'next' });
});

test('backup operation lock always releases after failure', async () => {
  const lock = createBackupOperationLock();
  await assert.rejects(lock.run(async () => { throw new Error('failed'); }), /failed/u);
  assert.equal(lock.isActive(), false);
});
