import type { AdminPage } from '../../app/routes';
import type { AppLanguage, LanguageOption } from '../../i18n/language';
import { adminCopies } from './adminCopy';
import { AdminLayout } from './layout/AdminLayout';
import { AdminBooksPage } from './pages/AdminBooksPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminQuestionLogsPage } from './pages/AdminQuestionLogsPage';
import { AdminQualityPage } from './pages/AdminQualityPage';
import { AdminReviewsPage } from './pages/AdminReviewsPage';
import { AdminSettingsPage } from './pages/AdminSettingsPage';
import type { AuthPrincipal } from '../../../shared/contracts/auth';

interface AdminAppProps {
  language: AppLanguage;
  languageDetails: LanguageOption;
  onChooseLanguage: () => void;
  page: AdminPage;
  principal: AuthPrincipal;
}

export function AdminApp({ language, languageDetails, onChooseLanguage, page, principal }: AdminAppProps) {
  const copy = adminCopies[language];

  return (
    <AdminLayout
      activePage={page}
      copy={copy}
      languageDetails={languageDetails}
      onChooseLanguage={onChooseLanguage}
      principal={principal}
    >
      {renderPage(page, copy, languageDetails, principal)}
    </AdminLayout>
  );
}

function renderPage(page: AdminPage, copy: (typeof adminCopies)[AppLanguage], language: LanguageOption, principal: AuthPrincipal) {
  switch (page) {
    case 'books': return <AdminBooksPage copy={copy} language={language.code} principal={principal} />;
    case 'reviews': return <AdminReviewsPage copy={copy} language={language.code} principal={principal} />;
    case 'question-logs': return <AdminQuestionLogsPage copy={copy} language={language.code} />;
    case 'quality': return <AdminQualityPage copy={copy} language={language.code} />;
    case 'settings': return <AdminSettingsPage copy={copy} languageDetails={language} />;
    default: return <AdminDashboardPage copy={copy} principal={principal} />;
  }
}
