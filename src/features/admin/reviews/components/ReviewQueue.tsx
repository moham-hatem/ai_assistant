import { AlertCircle, ChevronLeft, ChevronRight, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppLanguage } from '../../../../i18n/language';
import type { ReviewsCopy } from '../copy';
import { formatReviewDate, formatReviewLanguage } from '../format';
import { reviewRange } from '../pagination';
import type { LoadStatus, ReviewPage, ReviewQueueEntry } from '../types';
import { ReviewChannelBadge, ReviewStatusBadge } from './ReviewBadge';
import { ReviewState } from './ReviewState';

interface ReviewQueueProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  copy: ReviewsCopy;
  language: AppLanguage;
  onNext: () => void;
  onPrevious: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  page: ReviewPage | null;
  selectedId: string | null;
  status: LoadStatus;
}
export function ReviewQueue(props: ReviewQueueProps) {
  const { copy, page, status } = props;
  const range = reviewRange(page?.offset ?? 0, page?.items.length ?? 0);
  return (
    <section className="review-list-panel" aria-label={copy.queueLabel}>
      <header className="review-panel-header">
        <strong>{copy.reviewCount(page?.total ?? 0)}</strong>
        <button className="review-icon-button" disabled={status === 'loading'} onClick={props.onRefresh} title={copy.refresh} type="button">
          <RefreshCw aria-hidden="true" className={status === 'loading' ? 'is-spinning' : undefined} size={17} />
          <span className="sr-only">{copy.refresh}</span>
        </button>
      </header>
      {status === 'loading' && <ReviewState icon={<LoaderCircle className="is-spinning" size={24} />} title={copy.loadingList} />}
      {status === 'error' && <ReviewState action={<Retry copy={copy} onClick={props.onRefresh} />} icon={<AlertCircle size={24} />} title={copy.loadListError} />}
      {status === 'ready' && page?.items.length === 0 && <ReviewState body={copy.emptyBody} icon={<Inbox size={25} />} title={copy.emptyTitle} />}
      {status === 'ready' && page && page.items.length > 0 && (
        <>
          <div className="review-records">
            {page.items.map((entry) => (
              <ReviewQueueItem
                copy={copy}
                entry={entry}
                key={entry.item.id}
                language={props.language}
                onSelect={props.onSelect}
                selected={props.selectedId === entry.item.id}
              />
            ))}
          </div>
          <footer className="review-pagination">
            <span>{copy.rangeLabel(range.start, range.end, page.total)}</span>
            <span className="review-pagination-actions">
              <PageButton disabled={!props.canGoPrevious} label={copy.previousPage} onClick={props.onPrevious}><ChevronLeft size={18} /></PageButton>
              <PageButton disabled={!props.canGoNext} label={copy.nextPage} onClick={props.onNext}><ChevronRight size={18} /></PageButton>
            </span>
          </footer>
        </>
      )}
    </section>
  );
}

function ReviewQueueItem({ copy, entry, language, onSelect, selected }: {
  copy: ReviewsCopy;
  entry: ReviewQueueEntry;
  language: AppLanguage;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  return (
    <button aria-label={copy.viewDetails(entry.questionLog.question)} aria-pressed={selected} className="review-record" onClick={() => onSelect(entry.item.id)} type="button">
      <span className="review-record-topline">
        <span className="review-badges"><ReviewStatusBadge copy={copy} status={entry.item.status} /><ReviewChannelBadge channel={entry.questionLog.channel} /></span>
        <time dateTime={entry.item.updatedAt}>{formatReviewDate(entry.item.updatedAt, language)}</time>
      </span>
      <strong className="review-question" dir="auto">{entry.questionLog.question}</strong>
      <span className="review-record-meta">
        <span><small>{copy.answerLanguage}</small>{formatReviewLanguage(entry.questionLog.answerLanguage, language)}</span>
        <span><small>{copy.assignedReviewer}</small><bdi>{entry.item.assignedReviewerId ?? copy.unassigned}</bdi></span>
      </span>
    </button>
  );
}

function Retry({ copy, onClick }: { copy: ReviewsCopy; onClick: () => void }) {
  return <button className="review-secondary-button" onClick={onClick} type="button">{copy.retry}</button>;
}

function PageButton({ children, disabled, label, onClick }: { children: ReactNode; disabled: boolean; label: string; onClick: () => void }) {
  return <button className="review-icon-button review-page-button" disabled={disabled} onClick={onClick} title={label} type="button">{children}<span className="sr-only">{label}</span></button>;
}
