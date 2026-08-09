import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PWA_APPLY_UPDATE_EVENT,
  PWA_UPDATE_READY_EVENT,
  requestPwaUpdate,
} from '../../src/pwa/update-contract.ts';
import { registerServiceWorker } from '../../src/pwa/register-service-worker.ts';

test('update event names are stable and requesting an update is explicit', () => {
  assert.equal(PWA_UPDATE_READY_EVENT, 'daleel:pwa-update-ready');
  assert.equal(PWA_APPLY_UPDATE_EVENT, 'daleel:pwa-apply-update');

  const target = new EventTarget();
  let requests = 0;
  target.addEventListener(PWA_APPLY_UPDATE_EVENT, () => requests += 1);
  requestPwaUpdate(target as Window);
  assert.equal(requests, 1);
});

test('registration stays production-only and reloads only for an accepted update', async () => {
  const registration = await readFile(`${process.cwd()}/src/pwa/register-service-worker.ts`, 'utf8');
  assert.match(registration, /if \(!runtime\.isProduction/);
  assert.match(registration, /new CustomEvent\(PWA_UPDATE_READY_EVENT/);
  assert.match(registration, /browserWindow\.addEventListener\(PWA_APPLY_UPDATE_EVENT/);
  assert.match(registration, /if \(!reloadRequested \|\| didReload\) return;/);
  assert.match(registration, /waitingWorker\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(registration, /channel\.port1\.close\(\)/);
  assert.match(registration, /channel\.port2\.close\(\)/);
});

test('a registration rejection is contained and returned without logging', async () => {
  let logged = false;
  const originalError = console.error;
  console.error = () => { logged = true; };

  try {
    const result = await registerServiceWorker({
      browserWindow: {} as Window,
      isProduction: true,
      serviceWorker: {
        register: async () => { throw new Error('sensitive registration detail'); },
      } as unknown as ServiceWorkerContainer,
    });
    assert.equal(result, 'failed');
    assert.equal(logged, false);
  } finally {
    console.error = originalError;
  }
});

test('development mode never attempts registration', async () => {
  let attempts = 0;
  const result = await registerServiceWorker({
    browserWindow: {} as Window,
    isProduction: false,
    serviceWorker: {
      register: async () => { attempts += 1; throw new Error('must not run'); },
    } as unknown as ServiceWorkerContainer,
  });

  assert.equal(result, 'skipped');
  assert.equal(attempts, 0);
});
