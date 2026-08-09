import type { AppLanguage } from '../../../../i18n/language';
import type { ReviewsCopy } from '../copy';
import { formatReviewDate } from '../format';
import type { ReviewEvent } from '../types';

export function ReviewTimeline({ copy, events, language }: { copy: ReviewsCopy; events: ReviewEvent[]; language: AppLanguage }) {
  return (
    <section className="review-detail-section">
      <h3>{copy.eventHistory}</h3>
      {events.length === 0 && <p className="review-muted">{copy.noEvents}</p>}
      {events.length > 0 && (
        <ol className="review-timeline">
          {events.map((event) => (
            <li key={event.id}>
              <span className="review-timeline-dot" />
              <div>
                <strong>{copy.eventTypes[event.type]}</strong>
                <time dateTime={event.createdAt}>{formatReviewDate(event.createdAt, language)}</time>
                <p>
                  {event.fromStatus && <span>{copy.eventFrom}: {copy.statuses[event.fromStatus]}</span>}
                  <span>{copy.eventTo}: {copy.statuses[event.toStatus]}</span>
                  {event.reviewerId && <span>{copy.eventReviewer}: <bdi>{event.reviewerId}</bdi></span>}
                  {event.decisionId && <span>{copy.eventDecision}: <bdi>{event.decisionId}</bdi></span>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
