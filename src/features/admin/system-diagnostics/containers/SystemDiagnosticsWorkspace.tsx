import type { AppLanguage } from '../../../../i18n/language';
import { DiagnosticsCheckGrid } from '../components/DiagnosticsCheckGrid';
import { DiagnosticsPanelState } from '../components/DiagnosticsPanelState';
import { DiagnosticsSummaryCard } from '../components/DiagnosticsSummaryCard';
import { systemDiagnosticsCopies } from '../copy';
import { useSystemDiagnostics } from '../hooks/useSystemDiagnostics';

export function SystemDiagnosticsWorkspace({ language }: { language: AppLanguage }) {
  const copy = systemDiagnosticsCopies[language];
  const { dispatch, state } = useSystemDiagnostics();
  const report = state.response?.diagnostics;
  const refresh = () => dispatch({ type: 'refresh' });
  return <div className="system-diagnostics-workspace">
    {state.status === 'loading' && <DiagnosticsPanelState copy={copy} kind="loading" />}
    {state.status === 'error' && <DiagnosticsPanelState copy={copy} kind="error" onRetry={refresh} />}
    {report && <>
      <DiagnosticsSummaryCard
        busy={state.status === 'refreshing'}
        copy={copy}
        language={language}
        onRefresh={refresh}
        report={report}
      />
      <DiagnosticsCheckGrid checks={report.checks} copy={copy} language={language} />
    </>}
  </div>;
}
