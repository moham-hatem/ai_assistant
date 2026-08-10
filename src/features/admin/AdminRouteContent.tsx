import { lazy, Suspense } from 'react';
import type { AuthPrincipal } from '../../../shared/contracts/auth';
import type { AdminPage } from '../../app/routes';
import type { LanguageOption } from '../../i18n/language';
import { AsyncRouteErrorBoundary } from '../auth/components/AsyncRouteErrorBoundary';
import { AsyncRouteFallback } from '../auth/components/AsyncRouteFallback';
import type { AdminCopy } from './adminCopy';

const AdminBooksPage = lazy(() => import('./pages/AdminBooksPage').then((module) => ({ default: module.AdminBooksPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })));
const AdminQuestionLogsPage = lazy(() => import('./pages/AdminQuestionLogsPage').then((module) => ({ default: module.AdminQuestionLogsPage })));
const AdminQualityPage = lazy(() => import('./pages/AdminQualityPage').then((module) => ({ default: module.AdminQualityPage })));
const AdminReviewsPage = lazy(() => import('./pages/AdminReviewsPage').then((module) => ({ default: module.AdminReviewsPage })));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage').then((module) => ({ default: module.AdminSettingsPage })));
const AccessManagementPage = lazy(() => import('../access-management/AccessManagementPage').then((module) => ({ default: module.AccessManagementPage })));
const AdminSecurityAuditPage = lazy(() => import('./security-audit/AdminSecurityAuditPage').then((module) => ({ default: module.AdminSecurityAuditPage })));
const AdminBackupsPage = lazy(() => import('./backups/AdminBackupsPage').then((module) => ({ default: module.AdminBackupsPage })));
const AdminSystemDiagnosticsPage = lazy(() => import('./system-diagnostics/AdminSystemDiagnosticsPage').then((module) => ({ default: module.AdminSystemDiagnosticsPage })));

interface AdminRouteContentProps {
  copy: AdminCopy;
  language: LanguageOption;
  page: AdminPage;
  principal: AuthPrincipal;
}

export function AdminRouteContent(props: AdminRouteContentProps) {
  return <AsyncRouteErrorBoundary key={props.page} language={props.language}>
    <Suspense fallback={<AsyncRouteFallback language={props.language} />}>
      {renderPage(props)}
    </Suspense>
  </AsyncRouteErrorBoundary>;
}

function renderPage({ copy, language, page, principal }: AdminRouteContentProps) {
  switch (page) {
    case 'books': return <AdminBooksPage copy={copy} language={language.code} principal={principal} />;
    case 'reviews': return <AdminReviewsPage copy={copy} language={language.code} principal={principal} />;
    case 'question-logs': return <AdminQuestionLogsPage copy={copy} language={language.code} />;
    case 'quality': return <AdminQualityPage copy={copy} language={language.code} />;
    case 'access': return <AccessManagementPage language={language.code} />;
    case 'security-audit': return <AdminSecurityAuditPage copy={copy} language={language.code} />;
    case 'backups': return <AdminBackupsPage copy={copy} language={language.code} />;
    case 'system-diagnostics': return <AdminSystemDiagnosticsPage copy={copy} language={language.code} />;
    case 'settings': return <AdminSettingsPage copy={copy} languageDetails={language} />;
    default: return <AdminDashboardPage copy={copy} principal={principal} />;
  }
}
