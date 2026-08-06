import { X } from 'lucide-react';
import type { KnowledgeDocument } from '../types';
import type { KnowledgeCopy } from '../copy';

interface DocumentPreviewProps {
  copy: KnowledgeCopy;
  document: KnowledgeDocument;
  onClose: () => void;
}

export function DocumentPreview({ copy, document, onClose }: DocumentPreviewProps) {
  const resource = document.format === 'pdf' ? 'source' : 'text';
  const url = `/api/knowledge/documents/${encodeURIComponent(document.id)}/${resource}`;

  return (
    <div className="preview-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={copy.previewContent(document.name)}
        aria-modal="true"
        className="preview-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="preview-header">
          <div>
            <span>{copy.preview}</span>
            <h2 dir="auto">{document.name}</h2>
          </div>
          <button aria-label={copy.closePreview} onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <iframe className="preview-frame" src={url} title={copy.previewContent(document.name)} />
      </section>
    </div>
  );
}
