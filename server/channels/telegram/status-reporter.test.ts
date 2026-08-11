import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readTelegramRuntimeStatus } from './runtime-status.ts';
import { TelegramStatusReporter } from './status-reporter.ts';

test('status reporter serializes safe running and degraded snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'telegram-reporter-'));
  const path = join(directory, 'status.json');
  try {
    const reporter = new TelegramStatusReporter(path);
    reporter.running('Daleel_test_bot');
    reporter.heartbeat(1);
    await reporter.flush();
    const running = await readTelegramRuntimeStatus(path);
    assert.equal(running.kind, 'available');
    if (running.kind !== 'available') return;
    assert.equal(running.snapshot.state, 'running');
    assert.equal(running.snapshot.publicLink, 'https://t.me/Daleel_test_bot');
    assert.ok(running.snapshot.lastHandledUpdateAt);
    reporter.degraded('network_unavailable', 2);
    await reporter.flush();
    const degraded = await readTelegramRuntimeStatus(path);
    assert.equal(degraded.kind, 'available');
    if (degraded.kind !== 'available') return;
    assert.equal(degraded.snapshot.state, 'degraded');
    assert.equal(degraded.snapshot.errorCode, 'network_unavailable');
    assert.equal(degraded.snapshot.retryCount, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
