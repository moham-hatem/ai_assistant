import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquireSpaNavigationGuard,
  enforceSpaNavigationGuard,
  getSpaNavigationBlocked,
  guardBeforeUnload,
  shouldBlockSpaNavigation,
  subscribeSpaNavigationGuard,
  type NavigationSurface,
} from '../../src/app/spa-navigation-guard.ts';

test('one-time-secret guard blocks and restores hash navigation until its request settles', () => {
  const notifications: boolean[] = [];
  const unsubscribe = subscribeSpaNavigationGuard(() => {
    notifications.push(getSpaNavigationBlocked());
  });
  const release = acquireSpaNavigationGuard('#/admin/access');
  const replacements: string[] = [];
  const surface = {
    history: {
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
        replacements.push(String(url));
      },
      state: { request: 'still-pending' },
    },
    location: { hash: '#/admin/settings', pathname: '/app', search: '?local=true' },
  } as NavigationSurface;

  try {
    assert.equal(getSpaNavigationBlocked(), true);
    assert.equal(shouldBlockSpaNavigation('#/admin/access'), false);
    assert.equal(shouldBlockSpaNavigation('#/admin/settings'), true);
    assert.equal(enforceSpaNavigationGuard(surface), true);
    assert.deepEqual(replacements, ['/app?local=true#/admin/access']);
  } finally {
    release();
    unsubscribe();
  }

  assert.equal(getSpaNavigationBlocked(), false);
  assert.equal(shouldBlockSpaNavigation('#/admin/settings'), false);
  assert.deepEqual(notifications, [true, false]);
});

test('navigation remains blocked until every sensitive lease settles', () => {
  const releaseRecovery = acquireSpaNavigationGuard('#/admin/access');
  const releaseInvitation = acquireSpaNavigationGuard('#/admin/access');
  try {
    releaseRecovery();
    assert.equal(getSpaNavigationBlocked(), true);
    assert.equal(shouldBlockSpaNavigation('#/chat'), true);
    releaseInvitation();
    assert.equal(getSpaNavigationBlocked(), false);
  } finally {
    releaseRecovery();
    releaseInvitation();
  }
});

test('full-page unload receives a native warning only while a secret request is pending', () => {
  let prevented = false;
  const event = {
    preventDefault: () => { prevented = true; },
    returnValue: false,
  } as unknown as BeforeUnloadEvent;

  guardBeforeUnload(event);
  assert.equal(prevented, false);

  const release = acquireSpaNavigationGuard('#/admin/access');
  try {
    guardBeforeUnload(event);
    assert.equal(prevented, true);
    assert.equal(event.returnValue, true);
  } finally {
    release();
  }
});
