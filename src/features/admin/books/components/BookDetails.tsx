import type { AppLanguage } from '../../../../i18n/language';
import type { BooksCopy } from '../copy';
import type { EditionProcessingController } from '../hooks/useEditionProcessing';
import type {
  Book,
  BookEditionUploadState,
  EditionPage,
  LoadStatus,
  PendingTransition,
} from '../types';
import { BookEditionUploader } from './BookEditionUploader';
import { BookMetadata } from './BookMetadata';
import { BooksPanelState } from './BooksPanelState';
import { EditionsList } from './EditionsList';

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
  processing: EditionProcessingController;
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
      <EditionsList
        canGoNext={props.canGoNext}
        canGoPrevious={props.canGoPrevious}
        copy={props.copy}
        editions={props.editions}
        language={props.language}
        onNext={props.onNext}
        onPrevious={props.onPrevious}
        onTransition={props.onTransition}
        processing={props.processing}
        transitioningId={props.transitioningId}
      />
    </section>
  );
}
