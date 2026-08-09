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

interface AdminAppProps {
  language: AppLanguage;
  languageDetails: LanguageOption;
  onChooseLanguage: () => void;
  page: AdminPage;
}

export function AdminApp({ language, languageDetails, onChooseLanguage, page }: AdminAppProps) {
  const copy = adminCopies[language];

  return (
    <AdminLayout
      activePage={page}
      copy={copy}
      languageDetails={languageDetails}
      onChooseLanguage={onChooseLanguage}
    >
      {renderPage(page, copy, languageDetails)}
    </AdminLayout>
  );
}

function renderPage(page: AdminPage, copy: (typeof adminCopies)[AppLanguage], language: LanguageOption) {
  switch (page) {
    case 'books': return <AdminBooksPage copy={copy} language={language.code} />;
    case 'reviews': return <AdminReviewsPage copy={copy} language={language.code} />;
    case 'question-logs': return <AdminQuestionLogsPage copy={copy} language={language.code} />;
    case 'quality': return <AdminQualityPage copy={copy} language={language.code} />;
    case 'settings': return <AdminSettingsPage copy={copy} languageDetails={language} />;
    default: return <AdminDashboardPage copy={copy} />;
  }
}
