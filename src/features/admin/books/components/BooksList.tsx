import { BookMarked, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { visibleRange } from '../books-state';
import type { BooksCopy } from '../copy';
import { formatBookDate, formatBookLanguage } from '../format';
import type { BookPage, LoadStatus } from '../types';
import { BooksPanelState } from './BooksPanelState';

interface BooksListProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  copy: BooksCopy;
  language: AppLanguage;
  onNext: () => void;
  onPrevious: () => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  page: BookPage | null;
  selectedId: string | null;
  status: LoadStatus;
}

export function BooksList(props: BooksListProps) {
  const { copy, page, status } = props;
  const range = visibleRange(page?.offset ?? 0, page?.items.length ?? 0);
  return (
    <section className="books-list-panel" aria-label={copy.booksList}>
      <header className="books-panel-header">
        <div><span>{copy.booksList}</span><strong>{copy.bookCount(page?.total ?? 0)}</strong></div>
        <button aria-label={copy.refresh} className="books-icon-button" onClick={props.onRefresh} type="button">
          <RefreshCw className={status === 'loading' ? 'is-spinning' : undefined} size={17} />
        </button>
      </header>
      <div className="books-list-content">
        {status === 'error'
          ? <BooksPanelState actionLabel={copy.retry} body={copy.listError} onAction={props.onRefresh} title={copy.listError} tone="error" />
          : status === 'loading' && !page
            ? <BooksPanelState loading title={copy.loadingBooks} />
            : page?.items.length === 0
              ? <BooksPanelState body={copy.emptyBooksBody} title={copy.emptyBooksTitle} />
              : page?.items.map((book) => (
          <button
            aria-pressed={props.selectedId === book.id}
            className="book-list-item"
            key={book.id}
            onClick={() => props.onSelect(book.id)}
            type="button"
          >
            <span className="book-list-icon"><BookMarked size={19} /></span>
            <span className="book-list-main">
              <strong dir="auto">{book.title}</strong>
              <small dir="auto">{book.authorOrOrganization ?? copy.noAuthor}</small>
            </span>
            <span className="book-list-meta">
              <small>{formatBookLanguage(book.language, props.language)}</small>
              <time dateTime={book.updatedAt}>{formatBookDate(book.updatedAt, props.language)}</time>
            </span>
          </button>
              ))}
      </div>
      {page && page.total > 0 && (
        <footer className="books-pagination">
          <span>{copy.range(range.start, range.end, page.total)}</span>
          <div>
            <button aria-label={copy.previousPage} disabled={!props.canGoPrevious} onClick={props.onPrevious} type="button"><ChevronLeft size={17} /></button>
            <button aria-label={copy.nextPage} disabled={!props.canGoNext} onClick={props.onNext} type="button"><ChevronRight size={17} /></button>
          </div>
        </footer>
      )}
    </section>
  );
}
