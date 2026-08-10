import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withMaintenanceLock } from './maintenance-lock.ts';

test('maintenance lock excludes a concurrent operation and cleans up only its own lease', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-maintenance-lock-'));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = withMaintenanceLock(root, 'restore', async () => {
    await pending;
    return 'done';
  });
  try {
    await waitForFile(join(root, '.maintenance.lock'));
    await assert.rejects(
      withMaintenanceLock(root, 'retention', async () => undefined),
      /Maintenance is active/u,
    );
    release();
    assert.equal(await first, 'done');
    await assert.rejects(readFile(join(root, '.maintenance.lock')));
  } finally {
    release();
    await first.catch(() => undefined);
    await rm(root, { force: true, recursive: true });
  }
});

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await readFile(path); return; } catch { await new Promise((resolve) => setTimeout(resolve, 2)); }
  }
  throw new Error('Maintenance lock was not created.');
}
