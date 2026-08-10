import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { adminFetch, classifyAdminStatus } from '../../src/features/admin/api/admin-fetch.ts';
import { loginRequest, logoutRequest, sessionRequest, AuthApiError } from '../../src/features/auth/api.ts';
import { resolveAdminGate } from '../../src/features/auth/gate-state.ts';
import { canSubmitLogin } from '../../src/features/auth/login-state.ts';
import { parseLoginResponse, parseSessionResponse, AuthParseError } from '../../src/features/auth/parser.ts';
import { canApproveContentReview, canOpenAdminPage, canWriteBooks, hasPermission } from '../../src/features/auth/permissions.ts';
import { authReducer, initialAuthState } from '../../src/features/auth/state.ts';
import { reviewerIdFromPrincipal } from '../../src/features/admin/reviews/reviewer-session.ts';
import { AUTH_PERMISSIONS, AUTH_ROLES, type AuthPrincipal } from '../../shared/contracts/auth.ts';

const principal: AuthPrincipal = {
  id: 'teacher-17', email: 'teacher@example.test', displayName: 'Teacher Amina', roles: ['reviewer'],
  permissions: ['content:review'],
};

test('auth parsers accept the exact login and nullable session contracts', () => {
  assert.deepEqual(parseLoginResponse({ principal, requestId: 'req-1' }), { principal, requestId: 'req-1' });
  assert.deepEqual(parseSessionResponse({ principal: null, requestId: 'req-2' }), { principal: null, requestId: 'req-2' });
  assert.throws(() => parseLoginResponse({ principal: { ...principal, permissions: 'all' }, requestId: 'x' }), AuthParseError);
  assert.throws(() => parseLoginResponse({ principal: { ...principal, permissions: ['*'] }, requestId: 'x' }), AuthParseError);
  assert.throws(() => parseLoginResponse({ principal: { ...principal, roles: ['teacher'] }, requestId: 'x' }), AuthParseError);
  assert.throws(() => parseSessionResponse({ principal: null }), AuthParseError);
});

test('shared auth contract exposes only the gateway roles and final permissions', () => {
  assert.deepEqual(AUTH_ROLES, ['reviewer', 'content_manager', 'operator', 'admin']);
  assert.deepEqual(AUTH_PERMISSIONS, [
    'books:read', 'books:write', 'content:review', 'question_logs:read', 'quality:read', 'settings:manage',
  ]);
});

test('auth reducer ignores stale completions and handles login, logout, and 401 transitions', () => {
  const checking = authReducer(initialAuthState, { type: 'checking', requestId: 2 });
  const stale = authReducer(checking, { type: 'resolved', principal, requestId: 1 });
  assert.equal(stale.status, 'checking');
  const authenticated = authReducer(checking, { type: 'resolved', principal, requestId: 2 });
  assert.equal(authenticated.status, 'authenticated');
  assert.equal(authReducer(authenticated, { type: 'signed_out', requestId: 3 }).status, 'anonymous');
});

test('gate and navigation policy follow permissions while roles alone grant nothing', () => {
  const authenticated = { status: 'authenticated', principal, requestId: 1 } as const;
  assert.equal(resolveAdminGate(initialAuthState, 'reviews', false), 'loading');
  assert.equal(resolveAdminGate({ status: 'anonymous', principal: null, requestId: 1 }, 'reviews', false), 'login');
  assert.equal(resolveAdminGate(authenticated, 'reviews', false), 'admin');
  assert.equal(resolveAdminGate(authenticated, 'books', false), 'forbidden');
  assert.equal(resolveAdminGate({ ...authenticated, principal: { ...principal, permissions: [] } }, 'dashboard', false), 'admin');
  assert.equal(resolveAdminGate(authenticated, 'reviews', true), 'redirect');
  assert.equal(hasPermission({ ...principal, permissions: [], roles: ['admin'] }, 'content:review'), false);
  assert.equal(canWriteBooks({ ...principal, permissions: ['books:read', 'books:write'] }), true);
  assert.equal(canWriteBooks(principal), false);
  assert.equal(canApproveContentReview(principal), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['books:read'] }, 'books'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['question_logs:read'] }, 'question-logs'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['quality:read'] }, 'quality'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['settings:manage'] }, 'settings'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['settings:manage'] }, 'access'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['settings:manage'] }, 'security-audit'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['settings:manage'] }, 'backups'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: ['settings:manage'] }, 'system-diagnostics'), true);
  assert.equal(canOpenAdminPage({ ...principal, permissions: [] }, 'access'), false);
  assert.equal(reviewerIdFromPrincipal(principal), 'teacher-17');
});

test('login submission rejects blank credentials and a second in-flight submit', () => {
  assert.equal(canSubmitLogin(false, ' teacher@example.test ', 'secret'), true);
  assert.equal(canSubmitLogin(true, 'teacher@example.test', 'secret'), false);
  assert.equal(canSubmitLogin(false, ' ', 'secret'), false);
  assert.equal(canSubmitLogin(false, 'teacher@example.test', ''), false);
});

test('login, session, and logout use same-origin cookie credentials and exact methods', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), init });
    if (String(input).endsWith('/logout')) return new Response(null, { status: 204 });
    if (String(input).endsWith('/session')) return Response.json({ principal: null, requestId: 'session-1' });
    return Response.json({ principal, requestId: 'login-1' });
  };
  try {
    assert.equal((await loginRequest('teacher@example.test', 'secret')).principal.id, principal.id);
    assert.equal((await sessionRequest()).principal, null);
    await logoutRequest();
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(calls.map(({ input, init }) => [input, init?.method, init?.credentials]), [
    ['/api/auth/login', 'POST', 'same-origin'], ['/api/auth/session', 'GET', 'same-origin'], ['/api/auth/logout', 'POST', 'same-origin'],
  ]);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { email: 'teacher@example.test', password: 'secret' });
});

test('401 is an anonymous signal while 403 remains a permission signal', async () => {
  assert.equal(classifyAdminStatus(401), 'unauthorized');
  assert.equal(classifyAdminStatus(403), 'forbidden');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try { assert.equal((await adminFetch('/api/internal/reviews')).status, 401); }
  finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async () => new Response(null, { status: 403 });
  try { assert.equal((await adminFetch('/api/internal/reviews')).status, 403); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(authReducer({ status: 'authenticated', principal, requestId: 4 }, { type: 'signed_out', requestId: 5 }).status, 'anonymous');
  assert.equal(resolveAdminGate({ status: 'authenticated', principal, requestId: 4 }, 'reviews', false), 'admin');
});

test('auth API maps safe 401 and 403 errors without exposing response bodies', async () => {
  const originalFetch = globalThis.fetch;
  for (const status of [401, 403]) {
    globalThis.fetch = async () => Response.json({ message: 'sensitive server detail' }, { status });
    await assert.rejects(() => loginRequest('a@example.test', 'wrong'), (error: unknown) => {
      assert.ok(error instanceof AuthApiError);
      assert.equal(error.status, status);
      assert.equal(error.message.includes('sensitive'), false);
      return true;
    });
  }
  globalThis.fetch = originalFetch;
});

test('auth and reviewer identity code never persist credentials, tokens, or principals', async () => {
  const files = [
    'src/features/auth/AuthProvider.tsx', 'src/features/auth/api.ts',
    'src/features/auth/components/LoginPage.tsx', 'src/features/admin/reviews/reviewer-session.ts',
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage/);
  }
});
