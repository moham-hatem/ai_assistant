import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language.ts';
import { visibleRange } from '../books-state.ts';
import type { BooksCopy } from '../copy.ts';
import type { EditionProcessingController } from '../hooks/useEditionProcessing.ts';
import { processingCopies } from '../processing-copy.ts';
import type { EditionPage, EditionStatus, PendingTransition } from '../types.ts';
import { BookDocumentPreviewDialog, type PreviewResource } from './BookDocumentPreviewDialog.tsx';
import { EditionCard } from './EditionCard.tsx';
import { EditionProcessingPanel } from './EditionProcessingPanel.tsx';

interface EditionsListProps {
  canGoNext: boolean;
  canGoPrevious: boolean;
  copy: BooksCopy;
  editions: EditionPage;
  language: AppLanguage;
  onNext: () => void;
  onPrevious: () => void;
  onTransition: (transition: PendingTransition) => void;
  processing: EditionProcessingController;
  transitioningId: string | null;
}

interface PreviewState {
  documentId: string;
  resource: PreviewResource;
  version: string;
}

export function EditionsList(props: EditionsListProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const processingCopy = processingCopies[props.language];
  const range = visibleRange(props.editions.offset, props.editions.items.length);

  return (
    <div className="editions-section">
      <header><div><span>{props.copy.editions}</span><strong>{props.copy.editionCount(props.editions.total)}</strong></div></header>
      {props.editions.items.length === 0
        ? <p className="books-inline-empty">{props.copy.emptyEditions}</p>
        : props.editions.items.map((edition) => (
          <div className="edition-with-processing" key={edition.id}>
            <EditionCard
              copy={props.copy}
              edition={edition}
              language={props.language}
              onTransition={(item, target: EditionStatus) => props.onTransition({ edition: item, targetStatus: target })}
              transitioning={props.transitioningId === edition.id}
            />
            <EditionProcessingPanel
              copy={processingCopy}
              edition={edition}
              entry={props.processing.entries[edition.id]}
              language={props.language}
              notAvailable={props.copy.notAvailable}
              onApprove={() => void props.processing.approve(edition.id)}
              onPreview={(documentId, resource) => setPreview({ documentId, resource, version: edition.version })}
              onReprocess={() => void props.processing.reprocess(edition.id)}
              onRetry={() => props.processing.retry(edition.id)}
            />
          </div>
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
      {preview && (
        <BookDocumentPreviewDialog
          copy={processingCopy}
          documentId={preview.documentId}
          initialResource={preview.resource}
          key={`${preview.documentId}:${preview.resource}`}
          onClose={() => setPreview(null)}
          version={preview.version}
        />
      )}
    </div>
  );
}
