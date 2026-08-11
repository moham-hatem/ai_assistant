import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSystemDiagnosticsState,
  systemDiagnosticsReducer,
} from '../../src/features/admin/system-diagnostics/system-diagnostics-state.ts';
import { systemDiagnosticsPayload } from './system-diagnostics-fixtures.ts';

test('diagnostics state loads, refreshes, and preserves the last safe snapshot on failure', () => {
  let state = createSystemDiagnosticsState();
  assert.deepEqual(state, { reloadKey: 0, response: null, status: 'loading' });

  state = systemDiagnosticsReducer(state, { response: systemDiagnosticsPayload(), type: 'loaded' });
  assert.equal(state.status, 'ready');
  assert.equal(state.response?.diagnostics.checkedAt, '2026-08-10T12:30:00.000Z');
  assert.equal(
    state.response?.diagnostics.checks.find((check) => check.id === 'telegram.bot')?.details?.runtimeState,
    'running',
  );

  state = systemDiagnosticsReducer(state, { type: 'refresh' });
  assert.equal(state.status, 'refreshing');
  assert.equal(state.reloadKey, 1);
  assert.ok(state.response);
  assert.equal(
    state.response?.diagnostics.checks.find((check) => check.id === 'telegram.bot')?.details?.publicUsername,
    'LearningHelperBot',
  );

  state = systemDiagnosticsReducer(state, { type: 'failed' });
  assert.equal(state.status, 'error');
  assert.ok(state.response);
});

test('diagnostics state prevents duplicate in-flight refreshes and accepts a later snapshot', () => {
  let state = createSystemDiagnosticsState();
  assert.equal(systemDiagnosticsReducer(state, { type: 'refresh' }), state);
  state = systemDiagnosticsReducer(state, { response: systemDiagnosticsPayload(), type: 'loaded' });
  state = systemDiagnosticsReducer(state, { type: 'refresh' });
  assert.equal(systemDiagnosticsReducer(state, { type: 'refresh' }), state);

  const newer = systemDiagnosticsPayload();
  newer.diagnostics.checkedAt = '2026-08-10T12:31:00.000Z';
  state = systemDiagnosticsReducer(state, { response: newer, type: 'loaded' });
  assert.equal(state.status, 'ready');
  assert.equal(state.response?.diagnostics.checkedAt, '2026-08-10T12:31:00.000Z');
});

test('initial failure can be retried without fabricating a previous result', () => {
  let state = systemDiagnosticsReducer(createSystemDiagnosticsState(), { type: 'failed' });
  assert.equal(state.status, 'error');
  state = systemDiagnosticsReducer(state, { type: 'refresh' });
  assert.equal(state.status, 'loading');
  assert.equal(state.reloadKey, 1);
  assert.equal(state.response, null);
});
