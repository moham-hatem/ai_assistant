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
import { createDialogFocusCoordinator } from '../../src/features/access-management/invitation-recovery.ts';

const invitation: ActiveInvitation = {
  createdAt: '2026-08-10T10:00:00.000Z',
  displayName: 'Invited Member',
  email: 'invited@example.org',
  expiresAt: '2026-08-12T10:00:00.000Z',
  id: 'invite/id',
  roles: ['operator'],
  status: 'active',
};

test('active invitation parser accepts only the literal backend envelope and item contract', () => {
  const envelope = { items: [invitation], nextCursor: 'next', requestId: 'request-1' };
  assert.deepEqual(parseActiveInvitationPage(envelope), {
    items: [invitation], nextCursor: 'next',
  });

  for (const missing of ['items', 'nextCursor', 'requestId'] as const) {
    const invalidEnvelope = { ...envelope } as Record<string, unknown>;
    delete invalidEnvelope[missing];
    assert.throws(() => parseActiveInvitationPage(invalidEnvelope), AccessApiError);
  }
  for (const requestId of ['', 1, null, undefined]) {
    assert.throws(() => parseActiveInvitationPage({ ...envelope, requestId }), AccessApiError);
  }
  assert.throws(() => parseActiveInvitationPage({ ...envelope, nextCursor: 1 }), AccessApiError);
  assert.throws(() => parseActiveInvitationPage({ ...envelope, extra: true }), AccessApiError);

  for (const missing of Object.keys(invitation)) {
    const invalidItem = { ...invitation } as Record<string, unknown>;
    delete invalidItem[missing];
    assert.throws(() => parseActiveInvitationPage({ ...envelope, items: [invalidItem] }), AccessApiError);
  }
  for (const extra of ['secret', 'tokenHash', 'link', 'token', 'hash', 'unexpected']) {
    assert.throws(() => parseActiveInvitationPage({
      ...envelope,
      items: [{ ...invitation, [extra]: 'forbidden' }],
    }), AccessApiError);
  }
  for (const [field, value] of Object.entries({
    createdAt: 1,
    displayName: null,
    email: false,
    expiresAt: {},
    id: [],
    roles: 'operator',
    status: 1,
  })) {
    assert.throws(() => parseActiveInvitationPage({
      ...envelope,
      items: [{ ...invitation, [field]: value }],
    }), AccessApiError);
  }
  assert.throws(() => parseActiveInvitationPage({
    ...envelope,
    items: [{ ...invitation, status: 'revoked' }],
  }), AccessApiError);
});

test('active invitation parser rejects prototype and accessor surprises without invoking them', () => {
  const inheritedEnvelope = Object.assign(Object.create({ extra: 'inherited' }), {
    items: [invitation], nextCursor: null, requestId: 'request-1',
  });
  assert.throws(() => parseActiveInvitationPage(inheritedEnvelope), AccessApiError);
  const inheritedItem = Object.assign(Object.create({ tokenHash: 'inherited' }), invitation);
  assert.throws(() => parseActiveInvitationPage({
    items: [inheritedItem], nextCursor: null, requestId: 'request-1',
  }), AccessApiError);

  let getterRead = false;
  const accessorEnvelope = { nextCursor: null, requestId: 'request-1' } as Record<string, unknown>;
  Object.defineProperty(accessorEnvelope, 'items', {
    enumerable: true,
    get() { getterRead = true; return [invitation]; },
  });
  assert.throws(() => parseActiveInvitationPage(accessorEnvelope), AccessApiError);
  assert.equal(getterRead, false);
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

test('dialog focus coordinator consumes one intent after dialog restoration', () => {
  const events: string[] = [];
  const coordinator = createDialogFocusCoordinator();
  coordinator.request({
    focus: (options) => events.push(`focused:${String(options?.preventScroll)}`),
    scrollIntoView: (options) => events.push(`scrolled:${options?.block}`),
  });
  coordinator.afterClose();
  coordinator.afterClose();
  assert.deepEqual(events, ['scrolled:start', 'focused:true']);
});

test('active invitation client uses cursor GET and contract revoke POST without secret request data', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ body: BodyInit | null | undefined; method: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ body: init?.body, method: init?.method ?? 'GET', url: String(input) });
    if (init?.method === 'POST') return new Response(null, { status: 204 });
    return Response.json({ items: [invitation], nextCursor: null, requestId: 'request-1' });
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

test('invitation revoke rejects every non-204 success status as a contract error', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [200, 201, 202, 205]) {
      globalThis.fetch = async () => new Response(status === 205 ? null : '{}', { status });
      await assert.rejects(
        cancelActiveInvitation(invitation.id),
        (error: unknown) => error instanceof AccessApiError
          && error.code === 'INVALID_RESPONSE'
          && error.status === status,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('all locales provide executable lost-link recovery and recovery invalidation copy', () => {
  for (const copy of Object.values(accessCopies)) {
    assert.equal(copy.activeInvitations.recoveryHelp.length > 80, true);
    assert.equal(copy.activeInvitations.review.length > 8, true);
    assert.equal(copy.recovery.invalidatesPrevious.length > 45, true);
    assert.equal(copy.secret.recoveryInvalidation.length > 45, true);
  }
});
