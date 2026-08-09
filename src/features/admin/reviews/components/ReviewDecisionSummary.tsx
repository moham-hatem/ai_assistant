import type { ReviewsCopy } from '../copy';
import type { ReviewDecision } from '../types';

export function ReviewDecisionSummary({ copy, decision }: { copy: ReviewsCopy; decision: ReviewDecision | null }) {
  return (
    <section className="review-detail-section">
      <h3>{copy.decision}</h3>
      {!decision && <p className="review-muted">{copy.noDecision}</p>}
      {decision && (
        <div className="review-decision-summary">
          <dl className="review-metadata">
            <div><dt>{copy.decision}</dt><dd>{copy.outcomes[decision.outcome]}</dd></div>
            <div><dt>{copy.eventReviewer}</dt><dd><bdi>{decision.reviewerId}</bdi></dd></div>
          </dl>
          {decision.correctedAnswer && <div><small>{copy.correctedAnswer}</small><p dir="auto">{decision.correctedAnswer}</p></div>}
          {decision.internalNotes && <div><small>{copy.internalNotes}</small><p dir="auto">{decision.internalNotes}</p></div>}
        </div>
      )}
    </section>
  );
}
