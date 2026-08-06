import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { PlannedFeaturePanel } from '../components/PlannedFeaturePanel';

interface AdminReviewsPageProps { copy: AdminCopy }

export function AdminReviewsPage({ copy }: AdminReviewsPageProps) {
  const content = copy.placeholder.reviews;
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.reviews} eyebrow={copy.navigation.reviews} title={copy.pageTitle.reviews} />
      <PlannedFeaturePanel copy={copy} current={content.current} next={content.next} points={content.points} />
    </>
  );
}
