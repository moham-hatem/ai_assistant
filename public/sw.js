/* global DaleelSwPolicy */
importScripts('/sw-policy.js');

const VERSION = '2026-08-09.1';
const CACHE_PREFIX = 'daleel-pwa-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(DaleelSwPolicy.shellPaths)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== ASSET_CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }

  if (event.data?.type === 'GET_VERSION') {
    const message = { type: 'DALEEL_SW_VERSION', version: VERSION };
    if (event.ports[0]) event.ports[0].postMessage(message);
    else event.source?.postMessage(message);
  }
});

self.addEventListener('fetch', (event) => {
  const strategy = DaleelSwPolicy.classifyRequest(event.request, self.location.origin);
  if (strategy === 'network-only') return;

  if (strategy === 'navigation') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  const cacheName = strategy === 'asset' ? ASSET_CACHE : SHELL_CACHE;
  event.respondWith(cacheFirstWithSafeUpdate(event, cacheName));
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/'));
  }
}

async function cacheFirstWithSafeUpdate(event, cacheName) {
  const cached = await caches.match(event.request);
  if (cached) {
    event.waitUntil(fetchAndCache(event.request, cacheName).catch(() => undefined));
    return cached;
  }
  return fetchAndCache(event.request, cacheName);
}

async function fetchAndCache(request, cacheName) {
  const response = await fetch(request);
  if (DaleelSwPolicy.isSafeCacheResponse(response)) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}
