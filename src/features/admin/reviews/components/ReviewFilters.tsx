import { useEffect, useState, type FormEvent } from 'react';
import { reviewStatuses } from '../../../../../shared/contracts/reviews';
import type { ReviewsCopy } from '../copy';
import { emptyReviewFilters } from '../reviews-state';
import type { ReviewFilters as Filters } from '../types';

interface ReviewFiltersProps {
  copy: ReviewsCopy;
  filters: Filters;
  onChange: (filters: Filters) => void;
}
export function ReviewFilters({ copy, filters, onChange }: ReviewFiltersProps) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onChange({
      answerLanguage: draft.answerLanguage.trim(),
      channel: draft.channel.trim(),
      reviewerId: draft.reviewerId.trim(),
      status: draft.status,
    });
  }

  return (
    <form className="review-filters" onSubmit={submit}>
      <strong>{copy.filters}</strong>
      <label>
        <span>{copy.filterStatus}</span>
        <select onChange={(event) => setDraft({ ...draft, status: event.target.value as Filters['status'] })} value={draft.status}>
          <option value="">{copy.all}</option>
          {reviewStatuses.map((status) => <option key={status} value={status}>{copy.statuses[status]}</option>)}
        </select>
      </label>
      <label>
        <span>{copy.filterAnswerLanguage}</span>
        <input maxLength={200} onChange={(event) => setDraft({ ...draft, answerLanguage: event.target.value })} placeholder={copy.languagePlaceholder} value={draft.answerLanguage} />
      </label>
      <label>
        <span>{copy.filterChannel}</span>
        <input maxLength={200} onChange={(event) => setDraft({ ...draft, channel: event.target.value })} placeholder="web" value={draft.channel} />
      </label>
      <label>
        <span>{copy.filterReviewer}</span>
        <input maxLength={200} onChange={(event) => setDraft({ ...draft, reviewerId: event.target.value })} placeholder={copy.reviewerFilterPlaceholder} value={draft.reviewerId} />
      </label>
      <span className="review-filter-actions">
        <button className="review-secondary-button" onClick={() => { setDraft(emptyReviewFilters); onChange(emptyReviewFilters); }} type="button">{copy.clearFilters}</button>
        <button className="review-primary-button" type="submit">{copy.applyFilters}</button>
      </span>
    </form>
  );
}
