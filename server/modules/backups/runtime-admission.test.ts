import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireMaintenanceAdmission, acquireRuntimeAdmission } from './runtime-admission.ts';

test('runtime and maintenance admission leases exclude each other atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-'));
  const runtime = await acquireRuntimeAdmission(root);
  try {
    await assert.rejects(acquireMaintenanceAdmission(root), /runtime is active/u);
  } finally {
    await runtime.release();
  }
  const maintenance = await acquireMaintenanceAdmission(root);
  try {
    await assert.rejects(acquireRuntimeAdmission(root), /Maintenance is active/u);
  } finally {
    await maintenance.release();
    await rm(root, { force: true, recursive: true });
  }
});

test('multiple normal runtime writers may coexist while still excluding maintenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-multi-runtime-'));
  const first = await acquireRuntimeAdmission(root);
  const second = await acquireRuntimeAdmission(root);
  try {
    await assert.rejects(acquireMaintenanceAdmission(root), /runtime is active/u);
  } finally {
    await first.release();
    await second.release();
    await rm(root, { force: true, recursive: true });
  }
});

test('a scoped Vite lease adopts only valid legacy leases owned by the current process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-adopt-'));
  const first = await acquireRuntimeAdmission(root);
  const second = await acquireRuntimeAdmission(root, { scope: 'vite-local-api' });
  const vite = await acquireRuntimeAdmission(root, {
    adoptCurrentProcessLegacy: true,
    scope: 'vite-local-api',
  });
  try {
    const runtimeFiles = (await readdir(root)).filter((name) => name.startsWith('.runtime.'));
    assert.equal(runtimeFiles.length, 1);
    await assert.rejects(first.release(), /ownership changed/u);
    await assert.rejects(second.release(), /ownership changed/u);
    assert.equal((await readdir(root)).filter((name) => name.startsWith('.runtime.')).length, 1);
  } finally {
    await vite.release();
    await rm(root, { force: true, recursive: true });
  }
});

test('simultaneous runtime and maintenance admission allows at most one owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-race-'));
  try {
    const results = await Promise.allSettled([
      acquireRuntimeAdmission(root), acquireMaintenanceAdmission(root),
    ]);
    const winners = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireRuntimeAdmission>>> => result.status === 'fulfilled');
    assert.equal(winners.length, 1);
    await winners[0]?.value.release();
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('stale leases are removed under the gate while malformed ownership fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-stale-'));
  await mkdir(root, { recursive: true });
  const stale = JSON.stringify({
    kind: 'runtime', owner: '11111111-1111-4111-8111-111111111111', pid: 2_147_483_647,
    startedAt: '2026-08-10T12:00:00.000Z',
  });
  const stalePath = join(root, '.runtime.11111111-1111-4111-8111-111111111111.lock');
  await writeFile(stalePath, stale);
  const maintenance = await acquireMaintenanceAdmission(root);
  await maintenance.release();
  await assert.rejects(readFile(stalePath));

  await writeFile(join(root, '.maintenance.lock'), '{invalid');
  try {
    await assert.rejects(acquireRuntimeAdmission(root), /lease is invalid/u);
    assert.equal(await readFile(join(root, '.maintenance.lock'), 'utf8'), '{invalid');
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('normal runtime startup removes stale runtime leases while preserving active owners', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-runtime-stale-cleanup-'));
  const active = await acquireRuntimeAdmission(root, { scope: 'active-test' });
  const staleOwner = '11111111-1111-4111-8111-111111111111';
  await writeFile(join(root, `.runtime.${staleOwner}.lock`), JSON.stringify({
    kind: 'runtime', owner: staleOwner, pid: 2_147_483_647, scope: 'old-test',
    startedAt: '2026-08-10T12:00:00.000Z',
  }));
  let second;
  try {
    second = await acquireRuntimeAdmission(root, { scope: 'second-test' });
    const names = (await readdir(root)).filter((name) => name.startsWith('.runtime.'));
    assert.equal(names.length, 2);
    assert.equal(names.includes(`.runtime.${staleOwner}.lock`), false);
  } finally {
    await second?.release();
    await active.release();
    await rm(root, { force: true, recursive: true });
  }
});

test('runtime lease filename and recorded owner must match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-owner-name-'));
  await writeFile(join(root, '.runtime.11111111-1111-4111-8111-111111111111.lock'), JSON.stringify({
    kind: 'runtime', owner: '22222222-2222-4222-8222-222222222222', pid: 2_147_483_647,
    startedAt: '2026-08-10T12:00:00.000Z',
  }));
  try {
    await assert.rejects(acquireMaintenanceAdmission(root), /does not match its owner/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('stale maintenance and incomplete restore state fail closed for runtime startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-incomplete-'));
  await writeFile(join(root, '.maintenance.lock'), JSON.stringify({
    kind: 'maintenance', owner: crypto.randomUUID(), pid: 2_147_483_647,
    startedAt: '2026-08-10T12:00:00.000Z',
  }));
  try {
    await assert.rejects(acquireRuntimeAdmission(root), /stale maintenance lease/u);
    await rm(join(root, '.maintenance.lock'));
    await mkdir(join(root, '.restore-crashed'));
    await assert.rejects(acquireRuntimeAdmission(root), /incomplete restore workspace/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('unknown and legacy runtime locks fail closed instead of being ignored', async () => {
  for (const name of ['.runtime.lock', '.runtime-legacy.lock', '.runtime.bad.lock']) {
    const root = await mkdtemp(join(tmpdir(), 'ila-admission-unknown-'));
    await writeFile(join(root, name), 'legacy');
    try {
      await assert.rejects(acquireMaintenanceAdmission(root), /Unknown runtime lease/u);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test('lease release refuses to delete a replaced owner record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-admission-owner-'));
  const runtime = await acquireRuntimeAdmission(root);
  const runtimeFiles = (await readdir(root)).filter((name) => name.startsWith('.runtime.'));
  assert.equal(runtimeFiles.length, 1);
  const path = join(root, runtimeFiles[0]);
  await writeFile(path, JSON.stringify({
    kind: 'runtime', owner: crypto.randomUUID(), pid: process.pid,
    startedAt: new Date().toISOString(),
  }));
  try {
    await assert.rejects(runtime.release(), /ownership changed/u);
    assert.equal((await readFile(path, 'utf8')).length > 0, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
