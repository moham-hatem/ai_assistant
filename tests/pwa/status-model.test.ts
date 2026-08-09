import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPwaStatusState,
  parsePwaUpdateReadyEvent,
  pwaStatusReducer,
  subscribeToPwaStatus,
  type PwaStatusAction,
} from '../../src/features/pwa/model.ts';
import { startApiCompatibilityCheck } from '../../src/features/pwa/api-compatibility-monitor.ts';
import { getPwaChatBlockReason } from '../../src/features/pwa/chat-availability.ts';
import { enPwaCopy } from '../../src/features/pwa/copy/en.ts';
import { PWA_UPDATE_READY_EVENT } from '../../src/pwa/update-contract.ts';

test('the initial connection state comes from the runtime', () => {
  assert.deepEqual(createPwaStatusState(false), {
    apiCompatibility: 'unknown',
    isOnline: false,
    update: null,
  });
  assert.deepEqual(createPwaStatusState(true), {
    apiCompatibility: 'checking',
    isOnline: true,
    update: null,
  });
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
    apiCompatibility: 'checking',
    isOnline: false,
    update: { version: '2026-08-09.2' },
  });
  assert.deepEqual(pwaStatusReducer(offline, { isOnline: true, type: 'connection_changed' }), {
    apiCompatibility: 'checking',
    isOnline: true,
    update: { version: '2026-08-09.2' },
  });
});

test('compatibility state is independent and reconnecting starts a fresh check', () => {
  const withUpdate = pwaStatusReducer(createPwaStatusState(true), {
    type: 'update_ready',
    update: { version: '2026-08-09.3' },
  });
  const incompatible = pwaStatusReducer(withUpdate, {
    status: 'incompatible',
    type: 'compatibility_checked',
  });
  const offline = pwaStatusReducer(incompatible, { isOnline: false, type: 'connection_changed' });
  const reconnected = pwaStatusReducer(offline, { isOnline: true, type: 'connection_changed' });

  assert.equal(offline.apiCompatibility, 'incompatible');
  assert.equal(reconnected.apiCompatibility, 'checking');
  assert.deepEqual(reconnected.update, { version: '2026-08-09.3' });
});

test('compatibility monitor ignores a stale async result after cleanup', async () => {
  let resolveCheck!: (value: { apiVersion: string; status: 'incompatible' }) => void;
  const actions: PwaStatusAction[] = [];
  const cleanup = startApiCompatibilityCheck(
    () => new Promise((resolve) => { resolveCheck = resolve; }),
    (action) => actions.push(action),
  );

  assert.deepEqual(actions, [{ type: 'compatibility_check_started' }]);
  cleanup();
  resolveCheck({ apiVersion: '2', status: 'incompatible' });
  await Promise.resolve();
  assert.deepEqual(actions, [{ type: 'compatibility_check_started' }]);
});

test('compatibility monitor sanitizes rejected checks as unavailable', async () => {
  const actions: PwaStatusAction[] = [];
  startApiCompatibilityCheck(
    async () => { throw new Error('private endpoint detail'); },
    (action) => actions.push(action),
  );
  await Promise.resolve();

  assert.deepEqual(actions, [
    { type: 'compatibility_check_started' },
    { status: 'unavailable', type: 'compatibility_checked' },
  ]);
  assert.equal(JSON.stringify(actions).includes('private endpoint detail'), false);
});

test('only offline, checking, and incompatible PWA states block a saved chat draft', () => {
  assert.equal(getPwaChatBlockReason({ apiCompatibility: 'compatible', isOnline: true }, enPwaCopy), null);
  assert.equal(getPwaChatBlockReason({ apiCompatibility: 'unavailable', isOnline: true }, enPwaCopy), null);
  assert.equal(
    getPwaChatBlockReason({ apiCompatibility: 'checking', isOnline: true }, enPwaCopy),
    enPwaCopy.compatibilityChecking,
  );
  assert.equal(
    getPwaChatBlockReason({ apiCompatibility: 'unknown', isOnline: true }, enPwaCopy),
    enPwaCopy.compatibilityChecking,
  );
  assert.equal(
    getPwaChatBlockReason({ apiCompatibility: 'incompatible', isOnline: true }, enPwaCopy),
    enPwaCopy.incompatibleBody,
  );
  assert.equal(
    getPwaChatBlockReason({ apiCompatibility: 'compatible', isOnline: false }, enPwaCopy),
    enPwaCopy.composerOffline,
  );
});

function updateEvent(detail: unknown): Event {
  const event = new Event(PWA_UPDATE_READY_EVENT) as Event & { detail?: unknown };
  event.detail = detail;
  return event;
}
