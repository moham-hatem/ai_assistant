import { useState } from 'react';
import { DocumentList } from '../components/DocumentList';
import { DocumentPreview } from '../components/DocumentPreview';
import { DocumentUploader } from '../components/DocumentUploader';
import { useDocuments } from '../hooks/useDocuments';
import type { KnowledgeDocument } from '../types';
import type { AppLanguage } from '../../../i18n/language';
import { knowledgeCopies } from '../copy';

interface KnowledgeManagerProps { canWrite: boolean; language: AppLanguage }

export function KnowledgeManager({ canWrite, language }: KnowledgeManagerProps) {
  const copy = knowledgeCopies[language];
  const { add, documents, errorMessage, remove, status } = useDocuments(copy);
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const busy = status === 'saving';

  function handleDelete(document: KnowledgeDocument) {
    if (window.confirm(copy.confirmDelete(document.name))) {
      void remove(document.id);
    }
  }

  return (
    <section className="knowledge-manager" aria-label={copy.title}>
      {canWrite && <DocumentUploader busy={busy} copy={copy} errorMessage={errorMessage} onUpload={add} />}
      <DocumentList
        busy={busy}
        canDelete={canWrite}
        copy={copy}
        documents={documents}
        language={language}
        loading={status === 'loading'}
        onDelete={handleDelete}
        onView={setPreview}
      />
      {preview && <DocumentPreview copy={copy} document={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
