import { ArrowLeft, BookOpen, Globe2, LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AdminPage } from '../../../app/routes';
import type { LanguageOption } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminNavigation } from '../components/AdminNavigation';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { authCopies } from '../../auth/copy';
import { useAuth } from '../../auth/useAuth';
import { ForbiddenNotice } from '../../auth/components/ForbiddenNotice';

interface AdminLayoutProps {
  activePage: AdminPage;
  children: ReactNode;
  copy: AdminCopy;
  languageDetails: LanguageOption;
  onChooseLanguage: () => void;
  principal: AuthPrincipal;
}

export function AdminLayout({
  activePage,
  children,
  copy,
  languageDetails,
  onChooseLanguage,
  principal,
}: AdminLayoutProps) {
  const auth = useAuth();
  const authCopy = authCopies[languageDetails.code];
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try { await auth.logout(); window.location.hash = '#/admin/login'; }
    catch { setLogoutError(true); }
    finally { setLoggingOut(false); }
  }
  return (
    <main className="admin-shell" dir={languageDetails.dir}>
      <aside className="admin-sidebar">
        <a className="admin-brand" href="#/admin/dashboard">
          <span><BookOpen size={21} /></span>
          <div><strong>Daleel</strong><small>{copy.adminLabel}</small></div>
        </a>
        <AdminNavigation activePage={activePage} copy={copy} language={languageDetails.code} principal={principal} />
        <a className="back-to-assistant" href="#/chat">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{copy.backToAssistant}</span>
        </a>
      </aside>

      <section className="admin-main">
        <div className="admin-toolbar">
          <div className="admin-identity"><strong>{principal.displayName}</strong><span>{principal.email}</span></div>
          <div className="admin-toolbar-actions"><button className="language-switch" onClick={onChooseLanguage} title={copy.changeLanguage} type="button"><Globe2 size={17} /><span>{languageDetails.nativeLabel}</span></button><button className="admin-logout" disabled={loggingOut} onClick={() => void signOut()} type="button"><LogOut size={17} /><span>{loggingOut ? authCopy.loggingOut : authCopy.logout}</span></button></div>
        </div>
        <div className="admin-content">{logoutError && <div className="auth-error" role="alert">{authCopy.unavailable}</div>}{auth.forbiddenVersion > 0 && <ForbiddenNotice copy={authCopy} onClose={auth.clearForbidden} />}{children}</div>
      </section>
    </main>
  );
}
