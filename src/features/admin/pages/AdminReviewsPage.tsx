import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { ReviewsWorkspace } from '../reviews/containers/ReviewsWorkspace';

interface AdminReviewsPageProps { copy: AdminCopy; language: AppLanguage }

export function AdminReviewsPage({ copy, language }: AdminReviewsPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.reviews} eyebrow={copy.navigation.reviews} title={copy.pageTitle.reviews} />
      <ReviewsWorkspace language={language} />
    </>
  );
}
