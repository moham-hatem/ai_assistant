import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import type { QuestionLogsCopy } from '../copy';
import { formatDateTime, formatLanguageName } from '../format';
import { visibleRange } from '../pagination';
import type { LoadStatus, QuestionLogPage, QuestionLogSummary } from '../types';
import { QuestionLogBadges } from './QuestionLogBadges';
import { QuestionLogState } from './QuestionLogState';

interface QuestionLogListProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  copy: QuestionLogsCopy;
  language: AppLanguage;
  onNext: () => void;
  onPrevious: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  page: QuestionLogPage | null;
  selectedId: string | null;
  status: LoadStatus;
}

export function QuestionLogList({
  canGoNext,
  canGoPrevious,
  copy,
  language,
  onNext,
  onPrevious,
  onRefresh,
  onSelect,
  page,
  selectedId,
  status,
}: QuestionLogListProps) {
  const range = visibleRange(page?.offset ?? 0, page?.items.length ?? 0);

  return (
    <section className="question-log-list-panel" aria-label={copy.listLabel}>
      <header className="question-log-panel-header">
        <strong>{copy.recordCount(page?.total ?? 0)}</strong>
        <button
          className="question-log-icon-button"
          disabled={status === 'loading'}
          onClick={onRefresh}
          title={copy.refresh}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={status === 'loading' ? 'is-spinning' : undefined} size={17} />
          <span className="sr-only">{copy.refresh}</span>
        </button>
      </header>

      {status === 'loading' && (
        <QuestionLogState icon={<LoaderCircle className="is-spinning" size={24} />} title={copy.loadingList} />
      )}
      {status === 'error' && (
        <QuestionLogState
          action={<button className="question-log-action" onClick={onRefresh} type="button">{copy.retry}</button>}
          icon={<AlertCircle size={24} />}
          title={copy.loadListError}
        />
      )}
      {status === 'ready' && page?.items.length === 0 && (
        <QuestionLogState body={copy.emptyBody} icon={<Inbox size={25} />} title={copy.emptyTitle} />
      )}
      {status === 'ready' && page && page.items.length > 0 && (
        <>
          <div className="question-log-records">
            {page.items.map((record) => (
              <QuestionLogListItem
                copy={copy}
                language={language}
                key={record.id}
                onSelect={onSelect}
                record={record}
                selected={selectedId === record.id}
              />
            ))}
          </div>
          <footer className="question-log-pagination">
            <span>{copy.rangeLabel(range.start, range.end, page.total)}</span>
            <span className="question-log-pagination-actions">
              <button
                className="question-log-icon-button question-log-pagination-button"
                disabled={!canGoPrevious}
                onClick={onPrevious}
                title={copy.previousPage}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={18} />
                <span className="sr-only">{copy.previousPage}</span>
              </button>
              <button
                className="question-log-icon-button question-log-pagination-button"
                disabled={!canGoNext}
                onClick={onNext}
                title={copy.nextPage}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={18} />
                <span className="sr-only">{copy.nextPage}</span>
              </button>
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
interface QuestionLogListItemProps {
  copy: QuestionLogsCopy;
  language: AppLanguage;
  onSelect: (id: string) => void;
  record: QuestionLogSummary;
  selected: boolean;
}

function QuestionLogListItem({ copy, language, onSelect, record, selected }: QuestionLogListItemProps) {
  return (
    <button
      aria-label={copy.viewDetails(record.question)}
      aria-pressed={selected}
      className="question-log-record"
      onClick={() => onSelect(record.id)}
      type="button"
    >
      <span className="question-log-record-topline">
        <QuestionLogBadges copy={copy} record={record} />
        <time dateTime={record.startedAt}>{formatDateTime(record.startedAt, language)}</time>
      </span>
      <strong className="question-log-question" dir="auto">{record.question}</strong>
      <span className="question-log-record-meta">
        <span><small>{copy.language}</small>{formatLanguageName(record.answerLanguage, language)}</span>
        <span><small>{copy.model}</small><bdi>{record.model ?? copy.notAvailable}</bdi></span>
      </span>
    </button>
  );
}
