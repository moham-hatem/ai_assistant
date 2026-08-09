import { BookOpen, ClipboardCheck, ListTree, Settings, Users } from 'lucide-react';
import { adminRoute } from '../../../app/routes';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { FeatureStatusCard } from '../components/FeatureStatusCard';
import type { AuthPrincipal } from '../../../../shared/contracts/auth';
import { canOpenAdminPage } from '../../auth/permissions';

interface AdminDashboardPageProps { copy: AdminCopy; principal: AuthPrincipal }

export function AdminDashboardPage({ copy, principal }: AdminDashboardPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.dashboardIntro} eyebrow={copy.adminLabel} title={copy.dashboardTitle} />
      <section className="feature-status-grid" aria-label={copy.status}>
        {canOpenAdminPage(principal, 'books') && <FeatureStatusCard
          description={copy.featureCards.books.body}
          href={adminRoute('books')}
          icon={<BookOpen size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.books.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.books}
        />}
        {canOpenAdminPage(principal, 'reviews') && <FeatureStatusCard
          description={copy.featureCards.reviews.body}
          href={adminRoute('reviews')}
          icon={<ClipboardCheck size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.reviews.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.reviews}
        />}
        {canOpenAdminPage(principal, 'question-logs') && <FeatureStatusCard
          description={copy.featureCards.questionLogs.body}
          href={adminRoute('question-logs')}
          icon={<ListTree size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.questionLogs.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.questionLogs}
        />}
        {canOpenAdminPage(principal, 'access') && <FeatureStatusCard
          description={copy.featureCards.access.body}
          href={adminRoute('access')}
          icon={<Users size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.access.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.access}
        />}
        {canOpenAdminPage(principal, 'settings') && <FeatureStatusCard
          description={copy.featureCards.settings.body}
          href={adminRoute('settings')}
          icon={<Settings size={22} />}
          nextLabel={copy.nextStep}
          nextStep={copy.featureCards.settings.next}
          status={copy.ready}
          statusKind="ready"
          title={copy.navigation.settings}
        />}
      </section>
    </>
  );
}
