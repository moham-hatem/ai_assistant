import { useCallback, useEffect, useState } from 'react';
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
} from '../api/documents';
import type { KnowledgeDocument, KnowledgeStatus } from '../types';

export function useDocuments() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<KnowledgeStatus>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    await run(() => listDocuments().then(setDocuments));
    setStatus('idle');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function add(file: File) {
    setStatus('saving');
    const succeeded = await run(async () => {
      const document = await uploadDocument(file);
      setDocuments((current) => [document, ...current]);
    });
    setStatus('idle');
    return succeeded;
  }

  async function remove(id: string) {
    setStatus('saving');
    await run(async () => {
      await deleteDocument(id);
      setDocuments((current) => current.filter((document) => document.id !== id));
    });
    setStatus('idle');
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    setErrorMessage(null);
    try {
      await action();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع.');
      return false;
    }
  }

  return { add, documents, errorMessage, remove, status };
}
