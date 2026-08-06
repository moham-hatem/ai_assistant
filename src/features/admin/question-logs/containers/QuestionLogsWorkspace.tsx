import { useEffect, useRef } from 'react';
import type { AppLanguage } from '../../../../i18n/language';
import { QuestionLogDetails } from '../components/QuestionLogDetails';
import { QuestionLogList } from '../components/QuestionLogList';
import { questionLogsCopies } from '../copy';
import { useQuestionLogs } from '../hooks/useQuestionLogs';

interface QuestionLogsWorkspaceProps {
  language: AppLanguage;
}

export function QuestionLogsWorkspace({ language }: QuestionLogsWorkspaceProps) {
  const copy = questionLogsCopies[language];
  const logs = useQuestionLogs();
  const detailPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!logs.selectedId || logs.detailStatus === 'idle') return;
    if (window.matchMedia('(max-width: 980px)').matches) {
      detailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [logs.detailStatus, logs.selectedId]);

  function selectRecord(id: string) {
    logs.select(id);
  }

  return (
    <div className="question-logs-workspace">
      <QuestionLogList
        canGoNext={logs.canGoNext}
        canGoPrevious={logs.canGoPrevious}
        copy={copy}
        language={language}
        onNext={logs.goToNextPage}
        onPrevious={logs.goToPreviousPage}
        onRefresh={logs.retryList}
        onSelect={selectRecord}
        page={logs.page}
        selectedId={logs.selectedId}
        status={logs.listStatus}
      />
      <QuestionLogDetails
        copy={copy}
        language={language}
        onClose={logs.clearSelection}
        onRetry={logs.retryDetail}
        panelRef={detailPanelRef}
        record={logs.detail}
        selectedId={logs.selectedId}
        status={logs.detailStatus}
      />
    </div>
  );
}
