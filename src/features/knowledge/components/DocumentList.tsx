import { Eye, FileText, Trash2 } from 'lucide-react';
import { formatDocumentType, formatFileSize, formatImportedAt } from '../format';
import type { KnowledgeDocument } from '../types';

interface DocumentListProps {
  busy: boolean;
  documents: KnowledgeDocument[];
  loading: boolean;
  onDelete: (document: KnowledgeDocument) => void;
  onView: (document: KnowledgeDocument) => void;
}

export function DocumentList({ busy, documents, loading, onDelete, onView }: DocumentListProps) {
  if (loading) return <p className="empty-state">جارٍ تحميل قائمة الكتب…</p>;
  if (documents.length === 0) {
    return <p className="empty-state">لم تتم إضافة كتب بعد. استخدم النموذج بالأعلى.</p>;
  }

  return (
    <div className="document-list">
      {documents.map((document) => (
        <article className="document-row" key={document.id}>
          <span className="document-icon"><FileText size={20} /></span>
          <div className="document-details">
            <h3>{document.name}</h3>
            <p>
              {formatDocumentType(document.format)} · {formatFileSize(document.size)} ·{' '}
              {document.characterCount.toLocaleString('ar-EG')} حرف
            </p>
            <time dateTime={document.importedAt}>{formatImportedAt(document.importedAt)}</time>
          </div>
          <div className="document-actions">
            <button className="view-button" onClick={() => onView(document)} type="button">
              <Eye size={18} />
              <span>عرض المحتوى</span>
            </button>
            <button
              aria-label={`حذف ${document.name}`}
              className="delete-button"
              disabled={busy}
              onClick={() => onDelete(document)}
              type="button"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
