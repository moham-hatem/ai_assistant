import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { QuestionLogsWorkspace } from '../question-logs/containers/QuestionLogsWorkspace';

interface AdminQuestionLogsPageProps {
  copy: AdminCopy;
  language: AppLanguage;
}

export function AdminQuestionLogsPage({ copy, language }: AdminQuestionLogsPageProps) {
  return (
    <>
      <AdminPageHeader description={copy.pageIntro.questionLogs} eyebrow={copy.navigation.questionLogs} title={copy.pageTitle.questionLogs} />
      <QuestionLogsWorkspace language={language} />
    </>
  );
}
