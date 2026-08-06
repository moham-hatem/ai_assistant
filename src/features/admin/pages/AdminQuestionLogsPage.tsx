import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { PlannedFeaturePanel } from '../components/PlannedFeaturePanel';

interface AdminQuestionLogsPageProps { copy: AdminCopy }

export function AdminQuestionLogsPage({ copy }: AdminQuestionLogsPageProps) {
  const content = copy.placeholder.questionLogs;
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.questionLogs} eyebrow={copy.navigation.questionLogs} title={copy.pageTitle.questionLogs} />
      <PlannedFeaturePanel copy={copy} current={content.current} next={content.next} points={content.points} />
    </>
  );
}
