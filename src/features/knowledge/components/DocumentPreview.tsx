import { X } from 'lucide-react';
import type { KnowledgeDocument } from '../types';

interface DocumentPreviewProps {
  document: KnowledgeDocument;
  onClose: () => void;
}

export function DocumentPreview({ document, onClose }: DocumentPreviewProps) {
  const resource = document.format === 'pdf' ? 'source' : 'text';
  const url = `/api/knowledge/documents/${encodeURIComponent(document.id)}/${resource}`;

  return (
    <div className="preview-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={`محتوى ${document.name}`}
        aria-modal="true"
        className="preview-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="preview-header">
          <div>
            <span>معاينة المحتوى</span>
            <h2>{document.name}</h2>
          </div>
          <button aria-label="إغلاق المعاينة" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <iframe className="preview-frame" src={url} title={`محتوى ${document.name}`} />
      </section>
    </div>
  );
}
