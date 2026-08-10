import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelActiveInvitation,
  fetchActiveInvitations,
} from '../../src/features/access-management/api/active-invitations-api.ts';
import { parseActiveInvitationPage } from '../../src/features/access-management/api/active-invitations-parser.ts';
import { AccessApiError } from '../../src/features/access-management/api/access-parser.ts';
import { createInvitationCancellationHandler } from '../../src/features/access-management/active-invitation-cancel.ts';
import type { ActiveInvitation } from '../../src/features/access-management/active-invitation.ts';
import {
  activeInvitationsReducer,
  initialActiveInvitationsState,
} from '../../src/features/access-management/active-invitations-state.ts';
import { accessCopies } from '../../src/features/access-management/access-copy.ts';
import { revealActiveInvitations } from '../../src/features/access-management/invitation-recovery.ts';

const invitation: ActiveInvitation = {
  createdAt: '2026-08-10T10:00:00.000Z',
  displayName: 'Invited Member',
  email: 'invited@example.org',
  expiresAt: '2026-08-12T10:00:00.000Z',
  id: 'invite/id',
  roles: ['operator'],
  status: 'active',
};

test('active invitation parser accepts metadata and rejects secret-bearing or invalid records', () => {
  assert.deepEqual(parseActiveInvitationPage({ items: [invitation], nextCursor: 'next', requestId: 'ignored' }), {
    items: [invitation], nextCursor: 'next',
  });
  assert.throws(() => parseActiveInvitationPage({ items: [{ ...invitation, link: '#/password-setup?invitation=secret' }], nextCursor: null }), AccessApiError);
  assert.throws(() => parseActiveInvitationPage({ items: [{ ...invitation, token: 'secret' }], nextCursor: null }), AccessApiError);
  assert.throws(() => parseActiveInvitationPage({ items: [{ ...invitation, status: 'revoked' }], nextCursor: null }), AccessApiError);
});

test('invitation reducer ignores stale loads and cancellation completions while locking pagination', () => {
  let state = activeInvitationsReducer(initialActiveInvitationsState, { requestId: 2, type: 'list-loading' });
  state = activeInvitationsReducer(state, { page: { items: [invitation], nextCursor: 'next' }, requestId: 1, type: 'list-loaded' });
  assert.equal(state.page, null);
  state = activeInvitationsReducer(state, { page: { items: [invitation], nextCursor: 'next' }, requestId: 2, type: 'list-loaded' });
  state = activeInvitationsReducer(state, { id: invitation.id, requestId: 7, type: 'cancel-started' });
  assert.equal(activeInvitationsReducer(state, { type: 'next-page' }), state);
  assert.equal(activeInvitationsReducer(state, { id: invitation.id, requestId: 6, type: 'cancel-succeeded' }), state);
  state = activeInvitationsReducer(state, { id: invitation.id, requestId: 7, type: 'cancel-succeeded' });
  assert.deepEqual(state.page?.items, []);
  assert.equal(state.cancelingId, null);
  assert.equal(state.reloadKey, 1);
});

test('real cancellation handler is single-flight and reports the settled request once', async () => {
  let resolveRequest!: () => void;
  const requested: string[] = [];
  const events: string[] = [];
  const handler = createInvitationCancellationHandler(
    (id) => new Promise<void>((resolve) => { requested.push(id); resolveRequest = resolve; }),
    {
      failed: (requestId) => events.push(`failed:${requestId}`),
      started: (requestId, id) => events.push(`started:${requestId}:${id}`),
      succeeded: (requestId, id) => events.push(`succeeded:${requestId}:${id}`),
    },
  );

  const first = handler(invitation.id);
  assert.equal(await handler('other-id'), false);
  resolveRequest();
  assert.equal(await first, true);
  assert.deepEqual(requested, [invitation.id]);
  assert.deepEqual(events, [`started:1:${invitation.id}`, `succeeded:1:${invitation.id}`]);
});

test('lost-link recovery handler closes the dialog then focuses and reveals the active list', async () => {
  const events: string[] = [];
  revealActiveInvitations(
    () => events.push('closed'),
    {
      focus: (options) => events.push(`focused:${String(options?.preventScroll)}`),
      scrollIntoView: (options) => events.push(`scrolled:${options?.block}`),
    },
  );
  assert.deepEqual(events, ['closed']);
  await Promise.resolve();
  assert.deepEqual(events, ['closed', 'scrolled:start', 'focused:true']);
});

test('active invitation client uses cursor GET and contract revoke POST without secret request data', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: BodyInit | null | undefined; method: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ body: init?.body, method: init?.method ?? 'GET', url: String(input) });
    if (init?.method === 'POST') return new Response(null, { status: 204 });
    return Response.json({ items: [invitation], nextCursor: null });
  };
  try {
    await fetchActiveInvitations('cursor/value', 10);
    await cancelActiveInvitation(invitation.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(calls, [
    { body: undefined, method: 'GET', url: '/api/internal/access/invitations?limit=10&cursor=cursor%2Fvalue' },
    { body: '{}', method: 'POST', url: '/api/internal/access/invitations/invite%2Fid/revoke' },
  ]);
});

test('all locales provide executable lost-link recovery and recovery invalidation copy', () => {
  for (const copy of Object.values(accessCopies)) {
    assert.equal(copy.activeInvitations.recoveryHelp.length > 80, true);
    assert.equal(copy.activeInvitations.review.length > 8, true);
    assert.equal(copy.recovery.invalidatesPrevious.length > 45, true);
    assert.equal(copy.secret.recoveryInvalidation.length > 45, true);
  }
});
