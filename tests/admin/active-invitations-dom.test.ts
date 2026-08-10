import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { act, createElement, Fragment, useRef, useState } from 'react';
import type { Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { accessCopies } from '../../src/features/access-management/access-copy.ts';
import type { ActiveInvitation } from '../../src/features/access-management/active-invitation.ts';
import { ActiveInvitationList } from '../../src/features/access-management/components/ActiveInvitationList.tsx';
import { CancelInvitationDialog } from '../../src/features/access-management/components/CancelInvitationDialog.tsx';
import { InvitationDialog } from '../../src/features/access-management/components/InvitationDialog.tsx';
import { useActiveInvitations } from '../../src/features/access-management/hooks/useActiveInvitations.ts';
import {
  createDialogFocusCoordinator,
  type DialogFocusCoordinator,
} from '../../src/features/access-management/invitation-recovery.ts';

const invitation: ActiveInvitation = {
  createdAt: '2026-08-10T10:00:00.000Z',
  displayName: 'Invited Member',
  email: 'invited@example.org',
  expiresAt: '2026-08-12T10:00:00.000Z',
  id: 'invite-id',
  roles: ['operator'],
  status: 'active',
};

let container: HTMLElement;
let root: Root;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  const parsed = parseHTML('<!doctype html><html><body><main id="root"></main></body></html>');
  const { document, window } = parsed;
  const elementPrototype = window.HTMLElement.prototype as HTMLElement & {
    focus: () => void;
    scrollIntoView: () => void;
  };
  let activeElement: Element | null = document.body;
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => activeElement,
  });
  elementPrototype.focus = function focus(this: HTMLElement) { activeElement = this; };
  elementPrototype.scrollIntoView = function scrollIntoView() {};

  const dialogPrototype = Object.getPrototypeOf(document.createElement('dialog')) as {
    close?: () => void;
    open?: boolean;
    showModal?: () => void;
  };
  Object.defineProperty(dialogPrototype, 'open', {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute('open'); },
  });
  dialogPrototype.showModal = function showModal(this: HTMLElement) { this.setAttribute('open', ''); };
  dialogPrototype.close = function close(this: HTMLElement) { this.removeAttribute('open'); };

  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    Event: { configurable: true, value: window.Event },
    HTMLElement: { configurable: true, value: window.HTMLElement },
    Node: { configurable: true, value: window.Node },
    window: { configurable: true, value: window },
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch;
  const reactDom = await import('react-dom/client');
  container = document.querySelector('#root') as HTMLElement;
  root = reactDom.createRoot(container);
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await act(async () => { root.unmount(); await settle(); });
});

test('204 revoke removes the rendered row, closes the modal, and focuses the invitation list', async () => {
  installInvitationFetch(204);
  await renderActiveInvitationHarness();
  const revokeButton = requiredElement<HTMLButtonElement>('.access-danger-outline');

  await click(revokeButton);
  const dialog = requiredElement<HTMLDialogElement>('dialog[open]');
  const cancelButton = requiredElement<HTMLButtonElement>('.access-dialog-actions .access-secondary');
  const closeButton = requiredElement<HTMLButtonElement>('.access-dialog-heading button');
  assert.equal(document.activeElement, cancelButton);
  assert.notEqual(document.activeElement, closeButton);

  await click(requiredElement<HTMLButtonElement>('.access-dialog-actions .access-danger'));
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(document.querySelector('.access-invitation-card'), null);
  assert.equal(dialog.isConnected, false);
  assert.equal(document.activeElement, requiredElement<HTMLElement>('.access-invitations'));
});

test('a 200 revoke deviation keeps the rendered row and confirmation modal open', async () => {
  installInvitationFetch(200);
  await renderActiveInvitationHarness();
  await click(requiredElement<HTMLButtonElement>('.access-danger-outline'));
  await click(requiredElement<HTMLButtonElement>('.access-dialog-actions .access-danger'));

  assert.ok(document.querySelector('dialog[open]'));
  assert.ok(document.querySelector('.access-invitation-card'));
  assert.match(requiredElement<HTMLElement>('.access-inline-error').textContent ?? '', /could not be canceled/iu);
});

test('lost-response action restores the opener then deterministically focuses the list after close', async () => {
  await act(async () => { root.render(createElement(LostResponseHarness)); await settle(); });
  const opener = requiredElement<HTMLButtonElement>('#open-invitation');
  opener.focus();
  await click(opener);
  assert.ok(document.querySelector('dialog[open]'));

  await click(requiredElement<HTMLButtonElement>('.access-recovery-link'));
  const list = requiredElement<HTMLElement>('#lost-response-list');
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(document.activeElement, list);
  assert.notEqual(document.activeElement, opener);
  assert.equal(list.tabIndex, -1);
});

function ActiveInvitationHarness() {
  const active = useActiveInvitations();
  const [selected, setSelected] = useState<ActiveInvitation | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const focus = useCoordinator();

  async function confirm() {
    if (!selected) return;
    if (await active.cancel(selected.id)) {
      focus.request(listRef.current);
      setSelected(null);
    }
  }

  return createElement(Fragment, null,
    createElement(ActiveInvitationList, {
      canGoBack: active.state.cursorHistory.length > 0,
      cancelingId: active.state.cancelingId,
      copy: accessCopies.en,
      error: active.state.actionError,
      onCancel: setSelected,
      onNext: active.nextPage,
      onPrevious: active.previousPage,
      onRetry: active.reload,
      page: active.state.page,
      ref: listRef,
      status: active.state.status,
    }),
    selected && createElement(CancelInvitationDialog, {
      busy: active.state.cancelingId !== null,
      copy: accessCopies.en,
      invitation: selected,
      onAfterClose: focus.afterClose,
      onClose: () => { if (!active.state.cancelingId) setSelected(null); },
      onConfirm: () => void confirm(),
    }),
  );
}

function LostResponseHarness() {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLElement | null>(null);
  const focus = useCoordinator();
  return createElement(Fragment, null,
    createElement('button', { id: 'open-invitation', onClick: () => setOpen(true), type: 'button' }, 'Open'),
    createElement('section', { id: 'lost-response-list', ref: listRef, tabIndex: -1 }, 'Active invitations'),
    open && createElement(InvitationDialog, {
      copy: accessCopies.en,
      error: 'NETWORK_ERROR',
      inviting: false,
      onAfterClose: focus.afterClose,
      onClose: () => setOpen(false),
      onInvite: async () => false,
      onReviewActiveInvitations: () => {
        focus.request(listRef.current);
        setOpen(false);
      },
    }),
  );
}

function useCoordinator(): DialogFocusCoordinator {
  const coordinator = useRef<DialogFocusCoordinator | null>(null);
  if (!coordinator.current) coordinator.current = createDialogFocusCoordinator();
  return coordinator.current;
}

function installInvitationFetch(revokeStatus: number) {
  let revoked = false;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      if (revokeStatus === 204) revoked = true;
      return new Response(revokeStatus === 204 ? null : '{}', { status: revokeStatus });
    }
    return Response.json({
      items: revoked ? [] : [invitation],
      nextCursor: null,
      requestId: `list-${revoked ? 'after' : 'before'}`,
    });
  };
}

async function renderActiveInvitationHarness() {
  await act(async () => { root.render(createElement(ActiveInvitationHarness)); await settle(); });
  assert.ok(document.querySelector('.access-invitation-card'));
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new Event('click', { bubbles: true }));
    await settle();
  });
}

async function settle() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  assert.ok(element, `Expected ${selector} in the mounted DOM.`);
  return element as T;
}
