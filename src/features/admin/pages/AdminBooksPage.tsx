import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { BooksWorkspace } from '../books/containers/BooksWorkspace';
import { AdminPageHeader } from '../components/AdminPageHeader';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { canApproveContentReview, canWriteBooks } from '../../auth/permissions';

interface AdminBooksPageProps { copy: AdminCopy; language: AppLanguage; principal: AuthPrincipal }

export function AdminBooksPage({ copy, language, principal }: AdminBooksPageProps) {
  return (
    <>
      <AdminPageHeader
        description={copy.pageIntro.books}
        eyebrow={copy.navigation.books}
        title={copy.pageTitle.books}
      />
      <BooksWorkspace canReview={canApproveContentReview(principal)} canWrite={canWriteBooks(principal)} language={language} />
    </>
  );
}
