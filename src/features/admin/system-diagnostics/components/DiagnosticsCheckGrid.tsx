import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import type { SystemDiagnosticsCopy } from '../copy';
import { formatDiagnosticsDate, formatInteger, formatSpace, locationLabel } from '../format';
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
  const rows: Array<{ href?: string; label: string; leftToRight?: boolean; value: string }> = [];
  if (details.location) rows.push({
    label: copy.location,
    leftToRight: details.location.relativePath !== undefined,
    value: locationLabel(details.location, copy.scopes),
  });
  if (details.availableSpaceMiB !== undefined) rows.push({ label: copy.availableSpace, value: formatSpace(details.availableSpaceMiB, language) });
  if (details.readable !== undefined) rows.push({ label: copy.readable, value: details.readable ? copy.yes : copy.no });
  if (details.writable !== undefined) rows.push({ label: copy.writable, value: details.writable ? copy.yes : copy.no });
  if (details.mode) rows.push({ label: copy.checks['model.configuration'], value: copy.modes[details.mode] });
  if (details.configured !== undefined && details.runtimeState) rows.push({ label: copy.botConfigured, value: details.configured ? copy.yes : copy.no });
  if (details.running !== undefined) rows.push({ label: copy.botRunning, value: details.running ? copy.yes : copy.no });
  if (details.runtimeState) rows.push({ label: copy.statuses[details.runtimeState === 'running' ? 'healthy' : 'degraded'], value: copy.runtimeStates[details.runtimeState] });
  if (details.publicUsername) rows.push({ label: copy.publicUsername, leftToRight: true, value: `@${details.publicUsername}` });
  if (details.publicLink) rows.push({ href: details.publicLink, label: copy.publicLink, leftToRight: true, value: details.publicLink });
  if (details.lastSuccessfulPoll) rows.push({ label: copy.lastSuccessfulPoll, value: formatDiagnosticsDate(details.lastSuccessfulPoll, language) });
  if (details.lastHandledUpdateAt) rows.push({ label: copy.lastHandledUpdate, value: formatDiagnosticsDate(details.lastHandledUpdateAt, language) });
  if (details.retryCount !== undefined) rows.push({ label: copy.retryCount, value: formatInteger(details.retryCount, language) });
  if (details.telegramErrorCode) rows.push({ label: copy.statuses.degraded, value: copy.telegramErrors[details.telegramErrorCode] });
  if (rows.length === 0) return <span className="system-diagnostics-no-details">{copy.noDetails}</span>;
  return <dl>{rows.map(({ href, label, leftToRight, value }) => <div key={label}>
    <dt>{label}</dt>
    <dd dir={leftToRight ? 'ltr' : undefined}>{href
      ? <a href={href} rel="noreferrer" target="_blank">{value}</a>
      : value}</dd>
  </div>)}</dl>;
}
