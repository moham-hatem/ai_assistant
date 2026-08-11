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

test('transient failures use capped exponential backoff and emit sanitized status', async () => {
  const store = new TelegramStore(':memory:', secret);
  const controller = new AbortController();
  const statuses: Array<{ at: number; attempt?: number; delayMs?: number; type: string }> = [];
  const failure = new Error('upstream token must not enter status');
  const poller = new TelegramPoller({
    async getUpdates() { throw failure; },
  }, {
    async handle() { throw new Error('unreachable'); },
  }, store, {
    classifyFailure: () => 'transient',
    jitterRatio: 0,
    leaseMs: 5_000,
    maximumRetryDelayMs: 4,
    onStatus(status) {
      statuses.push(status);
      if (status.type === 'retrying' && status.attempt === 4) controller.abort();
    },
    pollTimeoutSeconds: 1,
    retryDelayMs: 1,
  });
  try {
    await poller.run(controller.signal);
    assert.deepEqual(statuses, [
      { at: statuses[0]?.at, type: 'running' },
      { at: statuses[1]?.at, attempt: 1, delayMs: 1, type: 'retrying' },
      { at: statuses[2]?.at, attempt: 2, delayMs: 2, type: 'retrying' },
      { at: statuses[3]?.at, attempt: 3, delayMs: 4, type: 'retrying' },
      { at: statuses[4]?.at, attempt: 4, delayMs: 4, type: 'retrying' },
      { at: statuses[5]?.at, type: 'stopped' },
    ]);
    assert.equal(JSON.stringify(statuses).includes('token'), false);
  } finally {
    store.close();
  }
});

test('fatal failures escape immediately while successful polls reset retry attempts and heartbeat', async () => {
  const fatalStore = new TelegramStore(':memory:', secret);
  const fatal = new Error('unauthorized');
  const fatalStatuses: string[] = [];
  const fatalPoller = new TelegramPoller({
    async getUpdates() { throw fatal; },
  }, {
    async handle() { throw new Error('unreachable'); },
  }, fatalStore, {
    classifyFailure: (error) => error === fatal ? 'fatal' : 'transient',
    leaseMs: 5_000,
    onStatus: (status) => fatalStatuses.push(status.type),
    pollTimeoutSeconds: 1,
    retryDelayMs: 1,
  });
  try {
    await assert.rejects(fatalPoller.run(new AbortController().signal), (error) => error === fatal);
    assert.deepEqual(fatalStatuses, ['running', 'fatal', 'stopped']);
  } finally {
    fatalStore.close();
  }

  const store = new TelegramStore(':memory:', secret);
  const controller = new AbortController();
  const attempts: number[] = [];
  const heartbeats: Array<{ offset?: number; updateCount: number }> = [];
  let calls = 0;
  const poller = new TelegramPoller({
    async getUpdates() {
      calls += 1;
      if (calls === 1 || calls === 3) throw new Error('transient');
      return [];
    },
  }, {
    async handle() { throw new Error('unreachable'); },
  }, store, {
    jitterRatio: 0,
    leaseMs: 5_000,
    onHeartbeat(heartbeat) {
      heartbeats.push(heartbeat);
      if (heartbeats.length === 2) controller.abort();
    },
    onStatus(status) {
      if (status.type === 'retrying') attempts.push(status.attempt);
      throw new Error('observability failure is isolated');
    },
    pollTimeoutSeconds: 1,
    retryDelayMs: 1,
  });
  try {
    await poller.run(controller.signal);
    assert.deepEqual(attempts, [1, 1]);
    assert.deepEqual(heartbeats.map(({ offset, updateCount }) => ({ offset, updateCount })), [
      { offset: undefined, updateCount: 0 },
      { offset: undefined, updateCount: 0 },
    ]);
  } finally {
    store.close();
  }
});
