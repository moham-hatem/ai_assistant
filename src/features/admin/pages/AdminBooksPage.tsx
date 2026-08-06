import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { BooksWorkspace } from '../books/containers/BooksWorkspace';
import { AdminPageHeader } from '../components/AdminPageHeader';

interface AdminBooksPageProps { copy: AdminCopy; language: AppLanguage }

export function AdminBooksPage({ copy, language }: AdminBooksPageProps) {
  return (
    <>
      <AdminPageHeader
        description={copy.pageIntro.books}
        eyebrow={copy.navigation.books}
        title={copy.pageTitle.books}
      />
      <BooksWorkspace language={language} />
    </>
  );
}
