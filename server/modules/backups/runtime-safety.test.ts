import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { maintenancePorts, RuntimeSafetyGuard } from './runtime-safety.ts';

test('runtime safety blocks active and unverifiable local ports', async () => {
  await assert.rejects(
    new RuntimeSafetyGuard([], [5173], async () => true).assertStopped(),
    /runtime port is active/u,
  );
  await assert.rejects(
    new RuntimeSafetyGuard([], [5173], async () => { throw new Error('unknown'); }).assertStopped(),
    /could not be verified/u,
  );
});

test('runtime safety requires exclusive, healthy SQLite access without writer sidecars', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-runtime-guard-'));
  const path = join(root, 'data.sqlite');
  const setup = new DatabaseSync(path);
  setup.exec('PRAGMA journal_mode=WAL; CREATE TABLE records (value TEXT); INSERT INTO records VALUES (\'safe\');');
  setup.close();
  const guard = new RuntimeSafetyGuard([path], [], async () => false);
  await guard.assertStopped();

  const writer = new DatabaseSync(path);
  writer.exec('BEGIN IMMEDIATE; INSERT INTO records VALUES (\'active\');');
  try {
    await assert.rejects(guard.assertStopped(), /active or could not be locked/u);
  } finally {
    writer.exec('ROLLBACK;');
    writer.close();
    await rm(root, { force: true, recursive: true });
  }
});

test('maintenance runtime ports are bounded, deduplicated, and configuration is fail-closed', () => {
  assert.deepEqual(maintenancePorts({ BACKUP_RUNTIME_PORTS: '5173,5174,5173' }), [5173, 5174]);
  assert.deepEqual(maintenancePorts({ BACKUP_RUNTIME_PORTS: '5173', VITE_PORT: '5190' }), [5173, 5190]);
  assert.equal(maintenancePorts({})[10], 5183);
  assert.throws(() => maintenancePorts({ BACKUP_RUNTIME_PORTS: '0' }));
  assert.throws(() => maintenancePorts({ AUTH_PUBLIC_ORIGIN: 'not-an-origin' }));
});
