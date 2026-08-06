import type { AppLanguage } from '../../../../i18n/language';
import type { BooksCopy } from '../copy';
import type { Book, EditionPage, EditionStatus, LoadStatus, PendingTransition } from '../types';
import { BookMetadata } from './BookMetadata';
import { BooksPanelState } from './BooksPanelState';
import { EditionCard } from './EditionCard';

interface BookDetailsProps {
  book: Book | null;
  copy: BooksCopy;
  editions: EditionPage | null;
  language: AppLanguage;
  onRetry: () => void;
  onTransition: (transition: PendingTransition) => void;
  selectedId: string | null;
  status: LoadStatus;
  transitioningId: string | null;
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
  return (
    <section className="book-details-panel">
      <BookMetadata book={props.book} copy={props.copy} language={props.language} />
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
      </div>
    </section>
  );
}
