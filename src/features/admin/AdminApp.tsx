import type { AdminPage } from '../../app/routes';
import type { AppLanguage, LanguageOption } from '../../i18n/language';
import { adminCopies } from './adminCopy';
import { AdminLayout } from './layout/AdminLayout';
import type { AuthPrincipal } from '../../../shared/contracts/auth';
import { AdminRouteContent } from './AdminRouteContent';

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
      <AdminRouteContent copy={copy} language={languageDetails} page={page} principal={principal} />
    </AdminLayout>
  );
}
