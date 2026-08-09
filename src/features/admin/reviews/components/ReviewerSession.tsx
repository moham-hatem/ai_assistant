import { ShieldAlert } from 'lucide-react';
import type { ReviewsCopy } from '../copy';

interface ReviewerSessionProps {
  copy: ReviewsCopy;
  onChange: (value: string) => void;
  reviewerId: string;
}
export function ReviewerSession({ copy, onChange, reviewerId }: ReviewerSessionProps) {
  return (
    <section className="review-session" aria-labelledby="review-session-title">
      <div className="review-session-heading">
        <ShieldAlert aria-hidden="true" size={20} />
        <div>
          <strong id="review-session-title">{copy.reviewerSession}</strong>
          <p>{copy.reviewerWarning}</p>
        </div>
      </div>
      <label>
        <span>{copy.reviewerId}</span>
        <input
          autoComplete="off"
          maxLength={200}
          onChange={(event) => onChange(event.target.value)}
          placeholder={copy.reviewerPlaceholder}
          spellCheck="false"
          type="text"
          value={reviewerId}
        />
      </label>
    </section>
  );
}
