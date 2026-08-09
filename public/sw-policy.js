(function defineDaleelServiceWorkerPolicy(scope) {
  'use strict';

  const shellPaths = Object.freeze([
    '/',
    '/index.html',
    '/manifest.webmanifest',
    '/icons/daleel-192.png',
    '/icons/daleel-512.png',
    '/icons/daleel-maskable-512.png',
  ]);
  const hashedAssetPattern = /^\/assets\/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8,}\.(?:css|js|mjs|woff2?|png|jpe?g|svg|webp|avif)$/;

  function classifyRequest(request, appOrigin) {
    if (!request || request.method !== 'GET') return 'network-only';

    const url = new URL(request.url);
    if (url.origin !== appOrigin || url.pathname.startsWith('/api/')) return 'network-only';
    if (request.mode === 'navigate') return 'navigation';
    if (shellPaths.includes(url.pathname)) return 'shell';
    if (hashedAssetPattern.test(url.pathname)) return 'asset';
    return 'network-only';
  }

  function isSafeCacheResponse(response) {
    return Boolean(response && response.ok && response.type === 'basic');
  }

  scope.DaleelSwPolicy = Object.freeze({
    classifyRequest,
    hashedAssetPattern,
    isSafeCacheResponse,
    shellPaths,
  });
})(globalThis);
