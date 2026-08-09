import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { ReviewsWorkspace } from '../reviews/containers/ReviewsWorkspace';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';

interface AdminReviewsPageProps { copy: AdminCopy; language: AppLanguage; principal: AuthPrincipal }

export function AdminReviewsPage({ copy, language, principal }: AdminReviewsPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.reviews} eyebrow={copy.navigation.reviews} title={copy.pageTitle.reviews} />
      <ReviewsWorkspace language={language} principal={principal} />
    </>
  );
}
