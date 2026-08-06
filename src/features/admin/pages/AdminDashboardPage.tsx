import { BookOpen, ClipboardCheck, ListTree, Settings } from 'lucide-react';
import { adminRoute } from '../../../app/routes';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { FeatureStatusCard } from '../components/FeatureStatusCard';

interface AdminDashboardPageProps { copy: AdminCopy }

export function AdminDashboardPage({ copy }: AdminDashboardPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.dashboardIntro} eyebrow={copy.adminLabel} title={copy.dashboardTitle} />
      <section className="feature-status-grid" aria-label={copy.status}>
        <FeatureStatusCard
          description={copy.featureCards.books.body}
          href={adminRoute('books')}
          icon={<BookOpen size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.books.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.books}
        />
        <FeatureStatusCard
          description={copy.featureCards.reviews.body}
          href={adminRoute('reviews')}
          icon={<ClipboardCheck size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.reviews.next}
          status={copy.planned}
          statusKind="planned"
          title={copy.navigation.reviews}
        />
        <FeatureStatusCard
          description={copy.featureCards.questionLogs.body}
          href={adminRoute('question-logs')}
          icon={<ListTree size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.questionLogs.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.questionLogs}
        />
        <FeatureStatusCard
          description={copy.featureCards.settings.body}
          href={adminRoute('settings')}
          icon={<Settings size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.settings.next}
          status={copy.planned}
          statusKind="planned"
          title={copy.navigation.settings}
        />
      </section>
    </>
  );
}
