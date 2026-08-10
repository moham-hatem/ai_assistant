import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the authenticated admin shell and every admin page use dynamic imports', async () => {
  const gate = await source('src/features/auth/components/AdminGate.tsx');
  assert.match(gate, /defaultAdminAppLoader[\s\S]+import\('\.\.\/\.\.\/admin\/AdminApp'\)/u);
  assert.doesNotMatch(gate, /import \{ AdminApp \}/u);

  const routes = await source('src/features/admin/AdminRouteContent.tsx');
  for (const modulePath of [
    './pages/AdminBooksPage', './pages/AdminDashboardPage', './pages/AdminQuestionLogsPage',
    './pages/AdminQualityPage', './pages/AdminReviewsPage', './pages/AdminSettingsPage',
    '../access-management/AccessManagementPage', './security-audit/AdminSecurityAuditPage',
    './backups/AdminBackupsPage', './system-diagnostics/AdminSystemDiagnosticsPage',
  ]) {
    assert.match(routes, new RegExp(`lazy\\(\\(\\) => import\\('${escapeRegExp(modulePath)}'\\)`, 'u'));
  }
  assert.match(routes, /<AsyncRouteErrorBoundary/u);
  assert.match(routes, /<Suspense fallback=\{<AsyncRouteFallback/u);
});

test('route loading feedback is localized and accessible', async () => {
  const fallback = await source('src/features/auth/components/AsyncRouteFallback.tsx');
  assert.match(fallback, /aria-live="polite"/u);
  assert.match(fallback, /aria-busy="true"/u);
  assert.match(fallback, /role="status"/u);
  assert.match(fallback, /ar:/u);
  assert.match(fallback, /en:/u);
  assert.match(fallback, /sw:/u);
  assert.doesNotMatch(fallback, /aria-busy="true"[^>]+role="status"/u);
});

function source(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
