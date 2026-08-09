import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

await import('../../public/sw-policy.js');

interface PolicyRequest {
  method: string;
  mode?: string;
  url: string;
}

interface ServiceWorkerPolicy {
  classifyRequest(request: PolicyRequest, origin: string): string;
  isSafeCacheResponse(response: { ok: boolean; type: string }): boolean;
  shellPaths: readonly string[];
}

const policy = (globalThis as typeof globalThis & { DaleelSwPolicy: ServiceWorkerPolicy }).DaleelSwPolicy;
const origin = 'https://daleel.test';

test('API, non-GET, cross-origin, and user-data requests stay network-only', () => {
  const unsafeRequests: PolicyRequest[] = [
    request('/api/answer'),
    request('/api/meta/version'),
    request('/api/internal/books/1'),
    request('/assets/app-12345678.js', 'POST'),
    { method: 'GET', mode: 'cors', url: 'https://cdn.example/app-12345678.js' },
    request('/data/documents/private-book.pdf'),
    request('/questions/recent.json'),
    request('/answers/cached.json'),
    request('/assets/unhashed.js'),
  ];

  for (const unsafeRequest of unsafeRequests) {
    assert.equal(policy.classifyRequest(unsafeRequest, origin), 'network-only', unsafeRequest.url);
  }
});

test('only navigation, declared shell files, and hashed Vite assets are handled', () => {
  assert.equal(policy.classifyRequest(request('/#/chat', 'GET', 'navigate'), origin), 'navigation');
  for (const path of policy.shellPaths) {
    assert.equal(policy.classifyRequest(request(path), origin), 'shell', path);
  }
  assert.equal(policy.classifyRequest(request('/assets/index-Ab12_cd3.js'), origin), 'asset');
  assert.equal(policy.classifyRequest(request('/assets/index-X9z8y7w6.css?v=1'), origin), 'asset');
});

test('only successful same-origin basic responses are safe to store', () => {
  assert.equal(policy.isSafeCacheResponse({ ok: true, type: 'basic' }), true);
  assert.equal(policy.isSafeCacheResponse({ ok: false, type: 'basic' }), false);
  assert.equal(policy.isSafeCacheResponse({ ok: true, type: 'cors' }), false);
  assert.equal(policy.isSafeCacheResponse({ ok: true, type: 'opaque' }), false);
});

test('classic worker delegates every fetch decision to the strict policy', async () => {
  const worker = await readFile(`${process.cwd()}/public/sw.js`, 'utf8');
  assert.match(worker, /^\/\* global DaleelSwPolicy \*\/\r?\nimportScripts\('\/sw-policy\.js'\);/);
  assert.match(worker, /classifyRequest\(event\.request, self\.location\.origin\)/);
  assert.match(worker, /if \(strategy === 'network-only'\) return;/);
  assert.match(worker, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(worker, /type: 'DALEEL_SW_VERSION', version: VERSION/);
  assert.ok(worker.indexOf('isSafeCacheResponse(response)') < worker.indexOf('cache.put(request, response.clone())'));
});

function request(path: string, method = 'GET', mode = 'cors'): PolicyRequest {
  return { method, mode, url: new URL(path, origin).href };
}
