import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccessUserDetails } from '../../shared/contracts/access-management.ts';
import {
  createAccessInvitation,
  createAccessRecovery,
  fetchAccessUser,
  fetchAccessUsers,
  redeemPasswordToken,
  revokeAccessUserSessions,
  setAccessUserEnabled,
  updateAccessUser,
} from '../../src/features/access-management/api/access-api.ts';
import {
  AccessApiError,
  parseAccessUserDetails,
  parseAccessUserPage,
  parseSecretLink,
} from '../../src/features/access-management/api/access-parser.ts';
import {
  accessReducer,
  initialAccessState,
} from '../../src/features/access-management/access-state.ts';

const user: AccessUserDetails = {
  createdAt: '2026-08-01T10:00:00.000Z',
  displayName: 'Team Member',
  email: 'member@example.org',
  enabled: true,
  id: 'user/id',
  roles: ['operator'],
  updatedAt: '2026-08-02T10:00:00.000Z',
};
const secret = {
  expiresAt: '2026-08-12T10:00:00.000Z',
  id: 'secret-1',
  link: 'https://app.example/#/password-setup?invitation=only-in-memory',
  warning: 'This link is a secret and will not be shown again.',
};

test('access parsers accept shared contracts and reject malformed external data', () => {
  assert.deepEqual(parseAccessUserPage({ items: [user], nextCursor: 'user/id', requestId: 'ignored' }), {
    items: [user], nextCursor: 'user/id',
  });
  assert.deepEqual(parseAccessUserDetails({ user }), user);
  assert.deepEqual(parseSecretLink({ ...secret, requestId: 'ignored' }), secret);
  assert.throws(() => parseAccessUserPage({ items: [{ ...user, roles: ['admin', 'admin'] }], nextCursor: null }), AccessApiError);
  assert.throws(() => parseAccessUserDetails({ user: { ...user, enabled: 'yes' } }), AccessApiError);
  assert.throws(() => parseSecretLink({ ...secret, warning: 'shown later' }), AccessApiError);
});

test('cursor state supports forward/back navigation and ignores stale list and detail responses', () => {
  let state = accessReducer(initialAccessState, { requestId: 2, type: 'list-loading' });
  state = accessReducer(state, { page: { items: [user], nextCursor: 'next' }, requestId: 1, type: 'list-loaded' });
  assert.equal(state.page, null);
  state = accessReducer(state, { page: { items: [user], nextCursor: 'next' }, requestId: 2, type: 'list-loaded' });
  state = accessReducer(state, { type: 'next-page' });
  assert.equal(state.cursor, 'next');
  assert.deepEqual(state.cursorHistory, [null]);
  state = accessReducer(state, { type: 'previous-page' });
  assert.equal(state.cursor, null);

  state = accessReducer(state, { id: user.id, requestId: 4, type: 'select-user' });
  const stale = { ...user, displayName: 'Stale' };
  state = accessReducer(state, { requestId: 3, type: 'detail-loaded', user: stale });
  assert.equal(state.detail, null);
  state = accessReducer(state, { requestId: 4, type: 'detail-loaded', user });
  assert.equal(state.detail?.displayName, user.displayName);
});

test('typed access client uses canonical cursor and action routes with JSON bodies', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: string | null; credentials?: RequestCredentials; method: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      body: typeof init?.body === 'string' ? init.body : null,
      credentials: init?.credentials,
      method: init?.method ?? 'GET',
      url,
    });
    if (url.endsWith('/revoke-sessions') || url.includes('/api/auth/')) return new Response(null, { status: 204 });
    if (url.endsWith('/recovery') || url.endsWith('/invitations')) return Response.json(secret, { status: 201 });
    if (url.includes('?')) return Response.json({ items: [user], nextCursor: null });
    return Response.json({ user });
  };
  try {
    await fetchAccessUsers('cursor/value', 25);
    await fetchAccessUser('user/id');
    await updateAccessUser('user/id', { displayName: 'Updated', roles: ['admin', 'reviewer'] });
    await setAccessUserEnabled('user/id', false);
    await setAccessUserEnabled('user/id', true);
    await revokeAccessUserSessions('user/id');
    await createAccessRecovery('user/id');
    await createAccessInvitation({ displayName: 'Invitee', email: 'invitee@example.org', roles: ['operator'] });
    await redeemPasswordToken('invitation', 'private-token', 'a secure password');
    await redeemPasswordToken('recovery', 'private-recovery', 'another secure password');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map(({ method, url }) => ({ method, url })), [
    { method: 'GET', url: '/api/internal/access/users?limit=25&cursor=cursor%2Fvalue' },
    { method: 'GET', url: '/api/internal/access/users/user%2Fid' },
    { method: 'PATCH', url: '/api/internal/access/users/user%2Fid' },
    { method: 'POST', url: '/api/internal/access/users/user%2Fid/disable' },
    { method: 'POST', url: '/api/internal/access/users/user%2Fid/enable' },
    { method: 'POST', url: '/api/internal/access/users/user%2Fid/revoke-sessions' },
    { method: 'POST', url: '/api/internal/access/users/user%2Fid/recovery' },
    { method: 'POST', url: '/api/internal/access/invitations' },
    { method: 'POST', url: '/api/auth/invitations/redeem' },
    { method: 'POST', url: '/api/auth/recovery/redeem' },
  ]);
  assert.deepEqual(JSON.parse(calls[2]!.body!), { displayName: 'Updated', roles: ['admin', 'reviewer'] });
  assert.deepEqual(JSON.parse(calls[5]!.body!), {});
  assert.equal(calls[8]!.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[8]!.body!), { password: 'a secure password', token: 'private-token' });
});

test('public redemption exposes one unified client error instead of server account or token details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ code: 'INVALID_OR_EXPIRED_TOKEN', email: 'hidden@example.org' }, { status: 400 });
  try {
    await assert.rejects(() => redeemPasswordToken('recovery', 'not-logged', 'a secure password'), (error: unknown) => {
      assert.ok(error instanceof AccessApiError);
      assert.equal(error.code, 'REQUEST_REJECTED');
      assert.equal(error.message.includes('hidden@example.org'), false);
      assert.equal(error.message.includes('not-logged'), false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
