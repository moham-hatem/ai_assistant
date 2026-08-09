import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FileText, ScanSearch, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ProcessingCopy } from '../processing-copy.ts';

export type PreviewResource = 'source' | 'text';

interface BookDocumentPreviewDialogProps {
  copy: ProcessingCopy;
  documentId: string;
  initialResource: PreviewResource;
  onClose: () => void;
  version: string;
}

export function BookDocumentPreviewDialog(props: BookDocumentPreviewDialogProps) {
  const { copy } = props;
  const [resource, setResource] = useState<PreviewResource>(props.initialResource);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const url = `/api/knowledge/documents/${encodeURIComponent(props.documentId)}/${resource}`;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div className="book-preview-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) props.onClose();
    }}>
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="book-preview-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <span>{copy.preview}</span>
            <h2 id={titleId} dir="auto">{props.version}</h2>
            <p id={descriptionId}>{copy.previewReadOnly}</p>
          </div>
          <button aria-label={copy.closePreview} onClick={props.onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div aria-label={copy.preview} className="book-preview-tabs" role="group">
          <button
            aria-pressed={resource === 'source'}
            onClick={() => setResource('source')}
            type="button"
          ><ScanSearch aria-hidden="true" size={16} />{copy.previewSource}</button>
          <button
            aria-pressed={resource === 'text'}
            onClick={() => setResource('text')}
            type="button"
          ><FileText aria-hidden="true" size={16} />{copy.previewExtractedText}</button>
        </div>
        <div className="book-preview-panel">
          <iframe
            key={url}
            referrerPolicy="no-referrer"
            sandbox=""
            src={url}
            title={`${copy.preview} — ${resource === 'source' ? copy.previewSource : copy.previewExtractedText}`}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
