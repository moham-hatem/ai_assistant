import { lazy, Suspense, useEffect, useMemo, type ComponentType } from 'react';
import { adminRoute, type AdminPage } from '../../../app/routes';
import type { AppLanguage, LanguageOption } from '../../../i18n/language';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { authCopies } from '../copy';
import { resolveAdminGate } from '../gate-state';
import { useAuth } from '../useAuth';
import { AuthError } from './AuthError';
import { AuthLoading } from './AuthLoading';
import { AsyncRouteErrorBoundary } from './AsyncRouteErrorBoundary';
import { AsyncRouteFallback } from './AsyncRouteFallback';
import { LoginPage } from './LoginPage';

interface LazyAdminAppProps {
  language: AppLanguage;
  languageDetails: LanguageOption;
  onChooseLanguage: () => void;
  page: AdminPage;
  principal: AuthPrincipal;
}

export type AdminAppLoader = () => Promise<{ default: ComponentType<LazyAdminAppProps> }>;
const defaultAdminAppLoader: AdminAppLoader = () => import('../../admin/AdminApp')
  .then((module) => ({ default: module.AdminApp }));

interface AdminGateProps {
  language: AppLanguage; languageDetails: LanguageOption; onChooseLanguage: () => void;
  page: AdminPage; loginRoute: boolean;
  loadAdminApp?: AdminAppLoader;
}

export function AdminGate(props: AdminGateProps) {
  const auth = useAuth();
  const copy = authCopies[props.language];
  const view = resolveAdminGate(auth.state, props.page, props.loginRoute);

  if (view === 'loading') return <AuthLoading copy={copy} />;
  if (view === 'error') return <AuthError copy={copy} onRetry={auth.retry} />;
  if (view === 'login') {
    return <LoginPage copy={copy} language={props.languageDetails} onChooseLanguage={props.onChooseLanguage} onLogin={auth.login} onSuccess={() => { window.location.hash = adminRoute(props.page); }} />;
  }
  if (view === 'redirect') return <LoginRedirect page={props.page} copy={copy} />;
  if (auth.state.status !== 'authenticated') return null;
  if (view === 'forbidden') {
    return <main className="auth-page" dir={props.languageDetails.dir}><div className="auth-state" role="alert"><h1>{copy.forbidden}</h1><p>{copy.forbiddenBody}</p><a href={adminRoute('dashboard')}>{copy.admin}</a></div></main>;
  }
  return <AdminBundle
    language={props.language}
    languageDetails={props.languageDetails}
    loader={props.loadAdminApp ?? defaultAdminAppLoader}
    onChooseLanguage={props.onChooseLanguage}
    page={props.page}
    principal={auth.state.principal}
  />;
}

function AdminBundle({ loader, ...props }: LazyAdminAppProps & { loader: AdminAppLoader }) {
  const AdminApp = useMemo(() => lazy(loader), [loader]);
  return <AsyncRouteErrorBoundary language={props.languageDetails}>
    <Suspense fallback={<AsyncRouteFallback language={props.languageDetails} />}>
      <AdminApp {...props} />
    </Suspense>
  </AsyncRouteErrorBoundary>;
}

function LoginRedirect({ page, copy }: { page: AdminPage; copy: (typeof authCopies)[AppLanguage] }) {
  useEffect(() => { window.location.replace(adminRoute(page)); }, [page]);
  return <AuthLoading copy={copy} />;
}
