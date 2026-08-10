import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import type { SystemDiagnosticsCopy } from '../copy';
import { formatSpace, locationLabel } from '../format';
import type { SystemDiagnosticCheck, SystemDiagnosticDetails } from '../types';

export function DiagnosticsCheckGrid({ checks, copy, language }: {
  checks: readonly SystemDiagnosticCheck[];
  copy: SystemDiagnosticsCopy;
  language: AppLanguage;
}) {
  return <ul className="system-diagnostics-checks">
    {checks.map((check) => <DiagnosticsCheckCard
      check={check}
      copy={copy}
      key={check.id}
      language={language}
    />)}
  </ul>;
}

function DiagnosticsCheckCard({ check, copy, language }: {
  check: SystemDiagnosticCheck;
  copy: SystemDiagnosticsCopy;
  language: AppLanguage;
}) {
  const Icon = check.status === 'healthy'
    ? CheckCircle2
    : check.status === 'degraded' ? AlertTriangle : XCircle;
  return <li className={`system-diagnostics-check status-${check.status}`}>
    <header>
      <div className="system-diagnostics-check-icon"><Icon aria-hidden="true" /></div>
      <div>
        <h2>{copy.checks[check.id]}</h2>
        <span>{copy.statuses[check.status]}</span>
      </div>
    </header>
    <p>{copy.codes[check.code]}</p>
    <SafeDetails copy={copy} details={check.details} language={language} />
  </li>;
}

function SafeDetails({ copy, details, language }: {
  copy: SystemDiagnosticsCopy;
  details?: SystemDiagnosticDetails;
  language: AppLanguage;
}) {
  if (!details) return <span className="system-diagnostics-no-details">{copy.noDetails}</span>;
  const rows: Array<[string, string, boolean?]> = [];
  if (details.location) rows.push([
    copy.location,
    locationLabel(details.location, copy.scopes),
    details.location.relativePath !== undefined,
  ]);
  if (details.availableSpaceMiB !== undefined) rows.push([copy.availableSpace, formatSpace(details.availableSpaceMiB, language)]);
  if (details.readable !== undefined) rows.push([copy.readable, details.readable ? copy.yes : copy.no]);
  if (details.writable !== undefined) rows.push([copy.writable, details.writable ? copy.yes : copy.no]);
  if (details.mode) rows.push([copy.checks['model.configuration'], copy.modes[details.mode]]);
  if (rows.length === 0) return <span className="system-diagnostics-no-details">{copy.noDetails}</span>;
  return <dl>{rows.map(([label, value, leftToRight]) => <div key={label}><dt>{label}</dt><dd dir={leftToRight ? 'ltr' : undefined}>{value}</dd></div>)}</dl>;
}
