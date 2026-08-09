import assert from 'node:assert/strict';
import test from 'node:test';
import { TelegramPoller } from './poller.ts';
import { TelegramStore } from './store.ts';
import type { TelegramUpdate } from './types.ts';

const secret = 'poller-test-session-secret-32-characters';

test('poller is sequential and advances offset only after success or completed duplicate', async () => {
  const update: TelegramUpdate = { updateId: 9 };
  const offsets: Array<number | undefined> = [];
  const store = new TelegramStore(':memory:', secret);
  let shouldFail = true;
  const handled: number[] = [];
  const poller = new TelegramPoller({
    async getUpdates(offset) { offsets.push(offset); return [update]; },
  }, {
    async handle(value) {
      handled.push(value.updateId);
      if (shouldFail) throw new Error('temporary');
    },
  }, store, { leaseMs: 5_000, pollTimeoutSeconds: 1, retryDelayMs: 1 });
  try {
    await assert.rejects(poller.pollOnce(), /temporary/);
    assert.equal(poller.currentOffset(), undefined);
    shouldFail = false;
    await poller.pollOnce();
    assert.equal(poller.currentOffset(), 10);
    await poller.pollOnce();
    assert.equal(poller.currentOffset(), 10);
    assert.deepEqual(offsets, [undefined, undefined, 10]);
    assert.deepEqual(handled, [9, 9]);
  } finally {
    store.close();
  }
});

test('an active claim blocks processing and offset advancement', async () => {
  const store = new TelegramStore(':memory:', secret);
  store.claimUpdate(12, 5_000);
  let handled = false;
  const poller = new TelegramPoller({
    async getUpdates() { return [{ updateId: 12 }]; },
  }, {
    async handle() { handled = true; },
  }, store, { leaseMs: 5_000, pollTimeoutSeconds: 1, retryDelayMs: 1 });
  try {
    await poller.pollOnce();
    assert.equal(handled, false);
    assert.equal(poller.currentOffset(), undefined);
  } finally {
    store.close();
  }
});
