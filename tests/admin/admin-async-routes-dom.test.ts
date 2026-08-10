import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { act, createElement, lazy, Suspense } from 'react';
import type { Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import type { AuthPrincipal } from '../../shared/contracts/auth.ts';
import { getLanguage } from '../../src/i18n/language.ts';
import { AuthContext, type AuthContextValue } from '../../src/features/auth/AuthProvider.tsx';
import { AdminGate, type AdminAppLoader } from '../../src/features/auth/components/AdminGate.tsx';
import { AsyncRouteErrorBoundary } from '../../src/features/auth/components/AsyncRouteErrorBoundary.tsx';
import { AsyncRouteFallback } from '../../src/features/auth/components/AsyncRouteFallback.tsx';

const principal: AuthPrincipal = {
  displayName: 'Operator', email: 'operator@example.test', id: 'operator-1',
  permissions: [], roles: ['operator'],
};
const language = getLanguage('en');
let container: HTMLElement;
let root: Root;
let originalConsoleError: typeof console.error;

beforeEach(async () => {
  const parsed = parseHTML('<!doctype html><html><body><main id="root"></main></body></html>');
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: parsed.document },
    Event: { configurable: true, value: parsed.window.Event },
    HTMLElement: { configurable: true, value: parsed.window.HTMLElement },
    Node: { configurable: true, value: parsed.window.Node },
    window: { configurable: true, value: parsed.window },
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  originalConsoleError = console.error;
  console.error = () => undefined;
  const reactDom = await import('react-dom/client');
  container = document.querySelector('#root') as HTMLElement;
  root = reactDom.createRoot(container);
});

afterEach(async () => {
  console.error = originalConsoleError;
  await act(async () => { root.unmount(); await settle(); });
});

test('anonymous and forbidden gate states never invoke the admin bundle loader', async () => {
  let loads = 0;
  const loader: AdminAppLoader = async () => {
    loads += 1;
    return { default: () => createElement('div', { 'data-admin-loaded': 'true' }) };
  };

  await renderGate({ status: 'anonymous', principal: null, requestId: 1 }, loader, 'dashboard');
  assert.equal(loads, 0);
  assert.ok(document.querySelector('form'));

  await renderGate({ status: 'authenticated', principal, requestId: 2 }, loader, 'books');
  assert.equal(loads, 0);
  assert.equal(document.querySelector('[role="alert"] h1')?.textContent, 'Permission required');

  await renderGate({ status: 'authenticated', principal, requestId: 3 }, loader, 'dashboard');
  assert.equal(loads, 1);
  assert.ok(document.querySelector('[data-admin-loaded="true"]'));
});

test('a rejected lazy route is contained and its translated reload action is usable', async () => {
  let retries = 0;
  const RejectedRoute = lazy(async () => { throw new Error('chunk rejected'); });
  await act(async () => {
    root.render(createElement(AsyncRouteErrorBoundary, {
      language,
      onRetry: () => { retries += 1; },
    }, createElement(Suspense, {
      fallback: createElement(AsyncRouteFallback, { language }),
    }, createElement(RejectedRoute))));
    await settle();
    await settle();
  });

  const alert = document.querySelector('.async-route-error');
  assert.equal(alert?.getAttribute('role'), 'alert');
  assert.equal(alert?.querySelector('h1')?.textContent, 'Page loading failed');
  const button = alert?.querySelector('button') as HTMLButtonElement | null;
  assert.equal(button?.textContent, 'Reload page');
  await act(async () => { button?.dispatchEvent(new Event('click', { bubbles: true })); await settle(); });
  assert.equal(retries, 1);
});

async function renderGate(
  state: AuthContextValue['state'],
  loader: AdminAppLoader,
  page: 'books' | 'dashboard',
) {
  const value: AuthContextValue = {
    clearForbidden: () => undefined,
    forbiddenVersion: 0,
    login: async () => undefined,
    logout: async () => undefined,
    retry: () => undefined,
    state,
  };
  await act(async () => {
    root.render(createElement(AuthContext.Provider, { value }, createElement(AdminGate, {
      language: 'en', languageDetails: language, loadAdminApp: loader,
      loginRoute: false, onChooseLanguage: () => undefined, page,
    })));
    await settle();
    await settle();
  });
}

async function settle() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}
