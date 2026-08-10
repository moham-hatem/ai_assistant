import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { formatAuditDate } from '../format';
import type { SecurityAuditCopy } from '../copy';
import type { SecurityAuditIntegritySummary } from '../types';

export function SecurityAuditIntegrityCard({ copy, integrity, language }: {
  copy: SecurityAuditCopy;
  integrity: SecurityAuditIntegritySummary;
  language: AppLanguage;
}) {
  const Icon = integrity.status === 'valid' ? ShieldCheck : integrity.status === 'invalid' ? ShieldAlert : ShieldQuestion;
  return <section className={`security-audit-integrity security-audit-integrity-${integrity.status}`} aria-labelledby="audit-integrity-title">
    <div className="security-audit-integrity-icon"><Icon aria-hidden="true" /></div>
    <div>
      <span>{copy.integrity}</span>
      <h2 id="audit-integrity-title">{copy.integrityStatuses[integrity.status]}</h2>
      <p>{copy.integrityNote}</p>
    </div>
    <dl>
      <div><dt>{copy.checkedAt}</dt><dd><time dateTime={integrity.checkedAt}>{formatAuditDate(integrity.checkedAt, language)}</time></dd></div>
      <div><dt>{copy.sequence}</dt><dd>{integrity.checkedEvents} / {integrity.totalEvents}</dd></div>
      <div><dt>{copy.keyVersions}</dt><dd dir="ltr">{integrity.keyVersions.join(', ') || '—'}</dd></div>
      {integrity.firstInvalidSequence !== null && <div><dt>{copy.firstInvalid}</dt><dd>{integrity.firstInvalidSequence}</dd></div>}
    </dl>
  </section>;
}
