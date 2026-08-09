import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { captureHashRoute, readBrowserRoute } from '../../src/app/secret-route.ts';

test('password secrets are captured in memory and immediately receive a clean hash', () => {
  const captured = captureHashRoute('#/password-setup?invitation=top-secret');
  assert.deepEqual(captured.route, { area: 'password', page: 'password-setup', token: 'top-secret' });
  assert.equal(captured.cleanHash, '#/password-setup');
  assert.equal(captured.cleanHash?.includes('top-secret'), false);
  assert.equal(captureHashRoute('#/password-setup?invitation=').cleanHash, '#/password-setup');
});

test('browser route capture removes the secret from the address bar with replaceState', () => {
  const originalWindow = globalThis.window;
  const replacements: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      history: { replaceState: (_state: unknown, _title: string, url: string) => replacements.push(url), state: null },
      location: { hash: '#/password-recovery?recovery=recovery-secret', pathname: '/', search: '' },
    },
  });
  try {
    const route = readBrowserRoute();
    assert.deepEqual(route, { area: 'password', page: 'password-recovery', token: 'recovery-secret' });
    assert.deepEqual(replacements, ['/#/password-recovery']);
    assert.equal(replacements.join('').includes('recovery-secret'), false);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});

test('access feature does not persist or log secret material', async () => {
  const files = [
    'src/features/access-management/api/access-api.ts',
    'src/features/access-management/PasswordAccessPage.tsx',
    'src/features/access-management/components/SecretLinkDialog.tsx',
    'src/features/access-management/hooks/useAccessManagement.ts',
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  assert.equal(/localStorage|sessionStorage/u.test(source), false);
  assert.equal(/console\.(?:log|error|warn|info)/u.test(source), false);
});

test('Arabic, English, and Swahili access copy remains genuine UTF-8', async () => {
  const source = await readFile('src/features/access-management/access-copy.ts', 'utf8')
    + await readFile('src/features/access-management/password-copy.ts', 'utf8');
  assert.match(source, /وصول الفريق/u);
  assert.match(source, /Team access/u);
  assert.match(source, /Ufikiaji wa timu/u);
  assert.doesNotMatch(source, /Ø|Ù|â€¦|â€™|ï¿½|�/u);
});
