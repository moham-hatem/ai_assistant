import assert from 'node:assert/strict';
import test from 'node:test';
import {
  API_COMPATIBILITY_ENDPOINT,
  API_COMPATIBILITY_TIMEOUT_MS,
  checkApiCompatibility,
  evaluateApiCompatibility,
  parseApiVersionContract,
} from '../../src/pwa/check-api-compatibility.ts';

test('pure compatibility evaluation follows the server client-version policy', () => {
  const contract = { apiVersion: '3', compatibleClientVersions: ['1', '2'] };

  assert.deepEqual(evaluateApiCompatibility('1', contract), {
    apiVersion: '3',
    status: 'compatible',
  });
  assert.deepEqual(evaluateApiCompatibility('3', contract), {
    apiVersion: '3',
    status: 'incompatible',
  });
});

test('version parser accepts only the exact, simple contract shape', () => {
  assert.deepEqual(parseApiVersionContract({
    apiVersion: '2',
    compatibleClientVersions: ['1', '2'],
  }), {
    apiVersion: '2',
    compatibleClientVersions: ['1', '2'],
  });

  const invalidContracts = [
    null,
    { apiVersion: '2' },
    { apiVersion: '2.0.0', compatibleClientVersions: ['1'] },
    { apiVersion: '2', compatibleClientVersions: [1] },
    { apiVersion: '2', compatibleClientVersions: ['1'], environment: 'secret' },
  ];
  for (const invalid of invalidContracts) {
    assert.throws(() => parseApiVersionContract(invalid), /Invalid API version contract/);
  }
});

test('client requests the endpoint with no-store and an injected timeout signal', async () => {
  const controller = new AbortController();
  let capturedUrl: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  let capturedTimeout: number | undefined;

  const result = await checkApiCompatibility({
    fetch: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({
        apiVersion: '1',
        compatibleClientVersions: ['1'],
      }), { status: 200 });
    },
    timeoutSignal: (timeoutMs) => {
      capturedTimeout = timeoutMs;
      return controller.signal;
    },
  });

  assert.deepEqual(result, { apiVersion: '1', status: 'compatible' });
  assert.equal(capturedUrl, API_COMPATIBILITY_ENDPOINT);
  assert.equal(capturedInit?.cache, 'no-store');
  assert.equal(capturedInit?.signal, controller.signal);
  assert.equal(capturedTimeout, API_COMPATIBILITY_TIMEOUT_MS);
});

test('client contains timeout, network, HTTP, and parsing details as unavailable', async () => {
  const secret = 'sensitive-server-error';
  const unavailable = { status: 'unavailable' };

  assert.deepEqual(await checkApiCompatibility({
    fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error(secret)), { once: true });
    }),
    timeoutMs: 25,
    timeoutSignal: () => {
      const controller = new AbortController();
      queueMicrotask(() => controller.abort(secret));
      return controller.signal;
    },
  }), unavailable);
  assert.deepEqual(await checkApiCompatibility({
    fetch: async () => { throw new Error(secret); },
    timeoutSignal: () => new AbortController().signal,
  }), unavailable);
  assert.deepEqual(await checkApiCompatibility({
    fetch: async () => new Response(secret, { status: 503 }),
    timeoutSignal: () => new AbortController().signal,
  }), unavailable);
  assert.deepEqual(await checkApiCompatibility({
    fetch: async () => new Response(JSON.stringify({ error: secret }), { status: 200 }),
    timeoutSignal: () => new AbortController().signal,
  }), unavailable);
  assert.equal(JSON.stringify(unavailable).includes(secret), false);
});
