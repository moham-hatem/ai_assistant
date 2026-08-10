import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readAuthConfig } from '../auth/config.ts';
import { createLocalConfig } from '../config.ts';
import { createLocalApiPlugin } from './local-api.ts';

test('local API releases runtime admission and closes resources after HTTP close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-local-api-close-'));
  const config = createLocalConfig({}, root);
  const server = fakeServer(true);
  try {
    await configure(config, root, server);
    assert.equal((await runtimeLeaseNames(config.backupDirectory)).length, 1);
    server.httpServer?.emit('close');
    await waitForNoRuntimeLease(config.backupDirectory);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('local API middleware mode releases runtime admission when the watcher closes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-local-api-middleware-close-'));
  const config = createLocalConfig({}, root);
  const server = fakeServer(false);
  try {
    await configure(config, root, server);
    assert.equal((await runtimeLeaseNames(config.backupDirectory)).length, 1);
    server.watcher.emit('close');
    await waitForNoRuntimeLease(config.backupDirectory);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('reconfiguring the same Vite server keeps one lease and one dispatch middleware', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-local-api-reconfigure-'));
  const config = createLocalConfig({}, root);
  const server = fakeServer(true);
  try {
    await configure(config, root, server);
    await configure(config, root, server);
    assert.equal((await runtimeLeaseNames(config.backupDirectory)).length, 1);
    assert.equal(server.middlewareUseCount(), 1);
    server.httpServer?.emit('close');
    await waitForNoRuntimeLease(config.backupDirectory);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('local API releases runtime admission and resources when setup fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ila-local-api-failure-'));
  const config = {
    ...createLocalConfig({}, root),
    documentDirectory: join(root, 'outside-data'),
  };
  const server = fakeServer(false);
  try {
    await assert.rejects(configure(config, root, server), /inside the configured data directory/u);
    assert.deepEqual(await runtimeLeaseNames(config.backupDirectory), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function configure(
  config: ReturnType<typeof createLocalConfig>,
  root: string,
  server: ReturnType<typeof fakeServer>,
): Promise<void> {
  const hook = createLocalApiPlugin(
    config,
    readAuthConfig({ AUTH_DATABASE_PATH: join(root, 'data', 'auth.sqlite') }, root),
    { setupError: 'audit intentionally unavailable in lifecycle test' },
  ).configureServer;
  assert.equal(typeof hook, 'function');
  await (hook as (server: unknown) => Promise<void>)(server);
}

function fakeServer(withHttpServer: boolean) {
  let uses = 0;
  return {
    config: { logger: { error: () => undefined, warn: () => undefined } },
    httpServer: withHttpServer ? new EventEmitter() : null,
    middlewares: { use: () => { uses += 1; } },
    middlewareUseCount: () => uses,
    watcher: new EventEmitter(),
  };
}

async function runtimeLeaseNames(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name.startsWith('.runtime.'));
}

async function waitForNoRuntimeLease(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await runtimeLeaseNames(directory)).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Runtime admission lease was not released after close.');
}
