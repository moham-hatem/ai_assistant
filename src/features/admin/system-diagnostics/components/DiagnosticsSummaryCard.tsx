import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import type { SystemDiagnosticsCopy } from '../copy';
import { formatDiagnosticsDate } from '../format';
import type { SystemDiagnosticsReport } from '../types';

export function DiagnosticsSummaryCard({ busy, copy, language, onRefresh, report }: {
  busy: boolean;
  copy: SystemDiagnosticsCopy;
  language: AppLanguage;
  onRefresh: () => void;
  report: SystemDiagnosticsReport;
}) {
  const Icon = report.status === 'healthy'
    ? CheckCircle2
    : report.status === 'degraded' ? AlertTriangle : XCircle;
  return <section className={`system-diagnostics-summary status-${report.status}`} aria-labelledby="diagnostics-summary-title">
    <div className="system-diagnostics-summary-icon"><Icon aria-hidden="true" /></div>
    <div className="system-diagnostics-summary-copy">
      <span>{copy.statuses[report.status]}</span>
      <h2 id="diagnostics-summary-title">{copy.summary[report.status]}</h2>
      <p>{copy.privacy}</p>
    </div>
    <dl className="system-diagnostics-summary-metadata">
      <div><dt>{copy.versionApp}</dt><dd dir="ltr">{report.versions.app}</dd></div>
      <div><dt>{copy.versionApi}</dt><dd dir="ltr">{report.versions.api}</dd></div>
      <div className="diagnostics-checked-at">
        <dt>{copy.checkedAt}</dt>
        <dd><time dateTime={report.checkedAt}>{formatDiagnosticsDate(report.checkedAt, language)}</time></dd>
      </div>
    </dl>
    <button className="system-diagnostics-refresh" type="button" disabled={busy} onClick={onRefresh}>
      <RefreshCw aria-hidden="true" className={busy ? 'system-diagnostics-spin' : undefined} />
      {busy ? copy.refreshing : copy.refresh}
    </button>
  </section>;
}
