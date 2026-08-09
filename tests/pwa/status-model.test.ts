import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPwaStatusState,
  parsePwaUpdateReadyEvent,
  pwaStatusReducer,
  subscribeToPwaStatus,
  type PwaStatusAction,
} from '../../src/features/pwa/model.ts';
import { PWA_UPDATE_READY_EVENT } from '../../src/pwa/update-contract.ts';

test('the initial connection state comes from the runtime', () => {
  assert.deepEqual(createPwaStatusState(false), { isOnline: false, update: null });
  assert.deepEqual(createPwaStatusState(true), { isOnline: true, update: null });
});

test('connection listeners dispatch changes and cleanup removes every listener', () => {
  const events = new EventTarget();
  const connection = { onLine: false };
  const actions: PwaStatusAction[] = [];
  const cleanup = subscribeToPwaStatus({ connection, events }, (action) => actions.push(action));

  assert.deepEqual(actions, [{ isOnline: false, type: 'connection_changed' }]);
  events.dispatchEvent(new Event('online'));
  assert.deepEqual(actions.at(-1), { isOnline: true, type: 'connection_changed' });

  const actionCount = actions.length;
  cleanup();
  events.dispatchEvent(new Event('offline'));
  events.dispatchEvent(updateEvent({ version: '2026-08-09.2' }));
  assert.equal(actions.length, actionCount);
});

test('update-ready detail is validated at runtime', () => {
  assert.deepEqual(parsePwaUpdateReadyEvent(updateEvent({ version: ' 2026-08-09.2 ' })), {
    version: '2026-08-09.2',
  });
  assert.deepEqual(parsePwaUpdateReadyEvent(updateEvent({ version: null })), { version: null });

  for (const detail of [undefined, {}, [], { version: 2 }, { version: '' }, { version: '<script>' }]) {
    assert.equal(parsePwaUpdateReadyEvent(updateEvent(detail)), null);
  }
  assert.equal(parsePwaUpdateReadyEvent(new Event('unrelated')), null);
});

test('connection and update states remain independent', () => {
  const initial = createPwaStatusState(true);
  const withUpdate = pwaStatusReducer(initial, {
    type: 'update_ready',
    update: { version: '2026-08-09.2' },
  });
  const offline = pwaStatusReducer(withUpdate, { isOnline: false, type: 'connection_changed' });

  assert.deepEqual(offline, {
    isOnline: false,
    update: { version: '2026-08-09.2' },
  });
  assert.deepEqual(pwaStatusReducer(offline, { isOnline: true, type: 'connection_changed' }), {
    isOnline: true,
    update: { version: '2026-08-09.2' },
  });
});

function updateEvent(detail: unknown): Event {
  const event = new Event(PWA_UPDATE_READY_EVENT) as Event & { detail?: unknown };
  event.detail = detail;
  return event;
}
