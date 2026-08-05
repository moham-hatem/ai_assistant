import { useState } from 'react';
import { DocumentList } from '../components/DocumentList';
import { DocumentPreview } from '../components/DocumentPreview';
import { DocumentUploader } from '../components/DocumentUploader';
import { useDocuments } from '../hooks/useDocuments';
import type { KnowledgeDocument } from '../types';

export function KnowledgeManager() {
  const { add, documents, errorMessage, remove, status } = useDocuments();
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const busy = status === 'saving';

  function handleDelete(document: KnowledgeDocument) {
    if (window.confirm(`هل تريد حذف «${document.name}» من قاعدة المعرفة؟`)) {
      void remove(document.id);
    }
  }

  return (
    <section className="knowledge-manager" aria-label="إدارة الكتب">
      <DocumentUploader busy={busy} errorMessage={errorMessage} onUpload={add} />
      <DocumentList
        busy={busy}
        documents={documents}
        loading={status === 'loading'}
        onDelete={handleDelete}
        onView={setPreview}
      />
      {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
