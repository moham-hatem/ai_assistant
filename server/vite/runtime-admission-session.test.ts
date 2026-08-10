import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { acquireMaintenanceAdmission } from '../modules/backups/runtime-admission.ts';
import { runtimeAdmissionSession } from './runtime-admission-session.ts';

test('Vite reconfiguration reuses one lease and cleans only the current resources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-vite-session-'));
  const owner = {};
  const emitter = new EventEmitter();
  const events: string[] = [];
  try {
    const first = await runtimeAdmissionSession(owner, emitter as never, root, () => undefined);
    await first.reconfigure(async () => () => { events.push('first-closed'); });
    const second = await runtimeAdmissionSession(owner, emitter as never, root, () => undefined);
    assert.equal(second, first);
    await second.reconfigure(async () => () => { events.push('second-closed'); });
    assert.deepEqual(events, ['first-closed']);
    assert.equal((await runtimeLocks(root)).length, 1);
    emitter.emit('close');
    await waitForNoRuntimeLocks(root);
    assert.deepEqual(events, ['first-closed', 'second-closed']);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('distinct server owners and a fresh module share one physical lease until both exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-vite-session-reload-'));
  const firstOwner = {};
  const secondOwner = {};
  const firstEmitter = new EventEmitter();
  const secondEmitter = new EventEmitter();
  try {
    const first = await runtimeAdmissionSession(
      firstOwner,
      firstEmitter as never,
      root,
      () => undefined,
    );
    const moduleUrl = new URL('./runtime-admission-session.ts', import.meta.url);
    moduleUrl.searchParams.set('reload', crypto.randomUUID());
    const reloaded = await import(moduleUrl.href);
    const second = await reloaded.runtimeAdmissionSession(
      secondOwner,
      secondEmitter as never,
      root,
      () => undefined,
    );
    assert.notEqual(second, first);
    assert.equal((await runtimeLocks(root)).length, 1);
    await first.close();
    assert.equal((await runtimeLocks(root)).length, 1);
    await second.close();
    await waitForNoRuntimeLocks(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('cleanup failure is aggregated without leaking the runtime lease', async () => {
  for (const operation of ['close', 'reconfigure'] as const) {
    const root = await mkdtemp(join(tmpdir(), `ila-vite-session-${operation}-failure-`));
    const owner = {};
    const emitter = new EventEmitter();
    const session = await runtimeAdmissionSession(owner, emitter as never, root, () => undefined);
    await session.reconfigure(async () => () => { throw new Error('injected cleanup failure'); });
    try {
      if (operation === 'close') {
        await assert.rejects(session.close(), AggregateError);
      } else {
        await assert.rejects(session.reconfigure(async () => () => undefined), AggregateError);
      }
      assert.deepEqual(await runtimeLocks(root), []);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  }
});

test('failed admission is removed from the server owner so a later startup can retry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-vite-session-acquire-retry-'));
  const owner = {};
  const emitter = new EventEmitter();
  const maintenance = await acquireMaintenanceAdmission(root);
  try {
    await assert.rejects(
      runtimeAdmissionSession(owner, emitter as never, root, () => undefined),
      /Maintenance is active/u,
    );
    await maintenance.release();
    const retried = await runtimeAdmissionSession(owner, emitter as never, root, () => undefined);
    await retried.close();
    assert.deepEqual(await runtimeLocks(root), []);
  } finally {
    await maintenance.release().catch(() => undefined);
    await rm(root, { force: true, recursive: true });
  }
});

async function runtimeLocks(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.startsWith('.runtime.'));
}

async function waitForNoRuntimeLocks(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await runtimeLocks(directory)).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Runtime lease was not released.');
}
