import { ArrowLeft, BookOpen, Globe2, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AdminPage } from '../../../app/routes';
import type { LanguageOption } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminNavigation } from '../components/AdminNavigation';

interface AdminLayoutProps {
  activePage: AdminPage;
  children: ReactNode;
  copy: AdminCopy;
  languageDetails: LanguageOption;
  onChooseLanguage: () => void;
}

export function AdminLayout({
  activePage,
  children,
  copy,
  languageDetails,
  onChooseLanguage,
}: AdminLayoutProps) {
  return (
    <main className="admin-shell" dir={languageDetails.dir}>
      <aside className="admin-sidebar">
        <a className="admin-brand" href="#/admin/dashboard">
          <span><BookOpen size={21} /></span>
          <div><strong>Daleel</strong><small>{copy.adminLabel}</small></div>
        </a>
        <AdminNavigation activePage={activePage} copy={copy} />
        <a className="back-to-assistant" href="#/chat">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{copy.backToAssistant}</span>
        </a>
      </aside>

      <section className="admin-main">
        <div className="admin-toolbar">
          <div className="admin-security-note"><ShieldAlert size={18} /><span>{copy.accessNotice}</span></div>
          <button className="language-switch" onClick={onChooseLanguage} title={copy.changeLanguage} type="button">
            <Globe2 size={17} />
            <span>{languageDetails.nativeLabel}</span>
          </button>
        </div>
        <div className="admin-content">{children}</div>
      </section>
    </main>
  );
}
