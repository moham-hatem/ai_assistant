import type { AppLanguage } from '../../../../i18n/language';
import { formatGeneratedAt } from '../formatters';
import { useQualityMetrics } from '../hooks/useQualityMetrics';
import { isQualityMetricsEmpty } from '../quality-metrics-state';
import { QualityBreakdownTable } from '../components/QualityBreakdownTable';
import { QualityDefinitions } from '../components/QualityDefinitions';
import { QualityFilters } from '../components/QualityFilters';
import { QualityMetricCards } from '../components/QualityMetricCards';
import { QualityPanelState } from '../components/QualityPanelState';
import { qualityMetricsCopies } from '../copy';

export function QualityMetricsWorkspace({ language }: { language: AppLanguage }) {
  const copy = qualityMetricsCopies[language];
  const { dispatch, state } = useQualityMetrics();
  const response = state.response;
  return <div className="quality-workspace">
    <QualityFilters copy={copy} dispatch={dispatch} state={state} />
    {state.status === 'loading' && <QualityPanelState copy={copy} kind="loading" />}
    {state.status === 'error' && <QualityPanelState copy={copy} kind="error" onRetry={() => dispatch({ type: 'retry' })} />}
    {state.status === 'ready' && response && isQualityMetricsEmpty(response) && <QualityPanelState copy={copy} kind="empty" />}
    {state.status === 'ready' && response && !isQualityMetricsEmpty(response) && <>
      <div className="quality-generated">{copy.generatedAt}: <time dateTime={response.generatedAt}>{formatGeneratedAt(response.generatedAt, language)} UTC</time></div>
      <QualityMetricCards copy={copy} language={language} metrics={response.metrics.totals} />
      <div className="quality-breakdown-grid">
        <QualityBreakdownTable copy={copy} language={language} rows={response.metrics.breakdowns.byLanguage} title={copy.breakdown.language} />
        <QualityBreakdownTable copy={copy} language={language} rows={response.metrics.breakdowns.byChannel} title={copy.breakdown.channel} />
      </div>
    </>}
    <QualityDefinitions copy={copy} />
  </div>;
}
