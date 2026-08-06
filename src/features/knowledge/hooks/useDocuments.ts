import { useCallback, useEffect, useState } from 'react';
import {
  deleteDocument,
  listDocuments,
  uploadDocument,
} from '../api/documents';
import { KnowledgeApiError } from '../api/documents';
import type { KnowledgeCopy } from '../copy';
import type { KnowledgeDocument, KnowledgeStatus } from '../types';

export function useDocuments(copy: KnowledgeCopy) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<KnowledgeStatus>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    await run(() => listDocuments().then(setDocuments));
    setStatus('idle');
  }, [copy]);

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
      setErrorMessage(error instanceof KnowledgeApiError && error.code === 'DOCUMENT_TOO_LARGE'
        ? copy.sizeError
        : copy.requestError);
      return false;
    }
  }

  return { add, documents, errorMessage, remove, retry: load, status };
}
