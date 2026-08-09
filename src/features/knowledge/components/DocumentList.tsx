import { Eye, FileText, Trash2 } from 'lucide-react';
import { formatDocumentType, formatFileSize, formatImportedAt } from '../format';
import type { KnowledgeDocument } from '../types';
import type { AppLanguage } from '../../../i18n/language';
import type { KnowledgeCopy } from '../copy';

interface DocumentListProps {
  busy: boolean;
  canDelete: boolean;
  copy: KnowledgeCopy;
  documents: KnowledgeDocument[];
  language: AppLanguage;
  loading: boolean;
  onDelete: (document: KnowledgeDocument) => void;
  onView: (document: KnowledgeDocument) => void;
}

export function DocumentList({ busy, canDelete, copy, documents, language, loading, onDelete, onView }: DocumentListProps) {
  if (loading) return <p className="empty-state">{copy.loading}</p>;
  if (documents.length === 0) {
    return <p className="empty-state">{copy.empty}</p>;
  }

  return (
    <div className="document-list">
      {documents.map((document) => (
        <article className="document-row" key={document.id}>
          <span className="document-icon"><FileText size={20} /></span>
          <div className="document-details">
            <h3 dir="auto">{document.name}</h3>
            <p>
              {formatDocumentType(document.format, copy)} · {formatFileSize(document.size, language, copy)} ·{' '}
              {copy.characters(document.characterCount)}
            </p>
            <time dateTime={document.importedAt}>{formatImportedAt(document.importedAt, language)}</time>
          </div>
          <div className="document-actions">
            <button className="view-button" onClick={() => onView(document)} type="button">
              <Eye size={18} />
              <span>{copy.view}</span>
            </button>
            {canDelete && <button
              aria-label={copy.deleteFile(document.name)}
              className="delete-button"
              disabled={busy}
              onClick={() => onDelete(document)}
              type="button"
            >
              <Trash2 size={18} />
            </button>}
          </div>
        </article>
      ))}
    </div>
  );
}
