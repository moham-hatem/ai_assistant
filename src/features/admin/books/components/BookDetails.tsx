import type { AppLanguage } from '../../../../i18n/language';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { visibleRange } from '../books-state';
import type { BooksCopy } from '../copy';
import type {
  Book,
  BookEditionUploadState,
  EditionPage,
  EditionStatus,
  LoadStatus,
  PendingTransition,
} from '../types';
import { BookEditionUploader } from './BookEditionUploader';
import { BookMetadata } from './BookMetadata';
import { BooksPanelState } from './BooksPanelState';
import { EditionCard } from './EditionCard';

interface BookDetailsProps {
  book: Book | null;
  canGoNext: boolean;
  canGoPrevious: boolean;
  copy: BooksCopy;
  editions: EditionPage | null;
  language: AppLanguage;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  onTransition: (transition: PendingTransition) => void;
  onUpload: (file: File, version: string) => Promise<boolean>;
  selectedId: string | null;
  status: LoadStatus;
  transitioningId: string | null;
  uploadState: BookEditionUploadState;
}

export function BookDetails(props: BookDetailsProps) {
  if (!props.selectedId) {
    return <section className="book-details-panel"><BooksPanelState body={props.copy.selectBookBody} title={props.copy.selectBookTitle} /></section>;
  }
  if (props.status === 'loading') {
    return <section className="book-details-panel"><BooksPanelState loading title={props.copy.loadingDetails} /></section>;
  }
  if (props.status === 'error' || !props.book || !props.editions) {
    return <section className="book-details-panel"><BooksPanelState actionLabel={props.copy.retry} body={props.copy.detailError} onAction={props.onRetry} title={props.copy.detailError} tone="error" /></section>;
  }
  const range = visibleRange(props.editions.offset, props.editions.items.length);
  return (
    <section className="book-details-panel">
      <BookMetadata book={props.book} copy={props.copy} language={props.language} />
      <BookEditionUploader
        {...props.uploadState}
        bookTitle={props.book.title}
        copy={props.copy}
        key={props.book.id}
        onUpload={props.onUpload}
      />
      <div className="editions-section">
        <header><div><span>{props.copy.editions}</span><strong>{props.copy.editionCount(props.editions.total)}</strong></div></header>
        {props.editions.items.length === 0
          ? <p className="books-inline-empty">{props.copy.emptyEditions}</p>
          : props.editions.items.map((edition) => (
            <EditionCard
              copy={props.copy}
              edition={edition}
              key={edition.id}
              language={props.language}
              onTransition={(item, target: EditionStatus) => props.onTransition({ edition: item, targetStatus: target })}
              transitioning={props.transitioningId === edition.id}
            />
          ))}
        {props.editions.total > 0 && (
          <footer className="edition-pagination">
            <span>{props.copy.range(range.start, range.end, props.editions.total)}</span>
            <div>
              <button aria-label={props.copy.previousPage} disabled={!props.canGoPrevious} onClick={props.onPrevious} type="button"><ChevronLeft size={17} /></button>
              <button aria-label={props.copy.nextPage} disabled={!props.canGoNext} onClick={props.onNext} type="button"><ChevronRight size={17} /></button>
            </div>
          </footer>
        )}
      </div>
    </section>
  );
}
