import type { AppLanguage } from '../../../../i18n/language';
import { formatAuditDate, formatAuditValue, shortHash } from '../format';
import type { SecurityAuditCopy } from '../copy';
import type { SecurityAuditEvent } from '../types';

export function SecurityAuditEventList({ copy, events, language }: {
  copy: SecurityAuditCopy;
  events: SecurityAuditEvent[];
  language: AppLanguage;
}) {
  return <ol className="security-audit-events" aria-label={copy.title}>
    {events.map((event) => <li className="security-audit-event" key={event.id}>
      <div className="security-audit-event-heading">
        <div>
          <span className={`security-audit-outcome security-audit-outcome-${event.outcome}`}>{copy.outcomes[event.outcome]}</span>
          <span className="security-audit-category">{copy.categories[event.category]}</span>
        </div>
        <time dateTime={event.timestamp}>{formatAuditDate(event.timestamp, language)}</time>
      </div>
      <h2>{copy.actions[event.action]}</h2>
      <dl className="security-audit-event-details">
        <div><dt>{copy.sequence}</dt><dd>{event.sequence}</dd></div>
        <div><dt>{copy.actor}</dt><dd dir={event.actorUserId ? 'ltr' : undefined}>{event.actorUserId ?? copy.noActor}</dd></div>
        <div><dt>{copy.subject}</dt><dd>{event.subjectType ? <>{copy.subjects[event.subjectType]} · <bdi dir="ltr">{event.subjectId}</bdi></> : '—'}</dd></div>
        <div><dt>{copy.requestId}</dt><dd dir="ltr">{event.requestId}</dd></div>
        <div><dt>{copy.eventHash}</dt><dd dir="ltr" title={event.eventHash}>{shortHash(event.eventHash)}</dd></div>
      </dl>
      <div className="security-audit-metadata">
        <strong>{copy.metadata}</strong>
        {Object.keys(event.metadata).length === 0
          ? <span>{copy.noMetadata}</span>
          : <dl>{Object.entries(event.metadata).map(([key, value]) => <div key={key}>
            <dt dir="ltr">{key}</dt><dd>{formatAuditValue(value, language)}</dd>
          </div>)}</dl>}
      </div>
    </li>)}
  </ol>;
}
