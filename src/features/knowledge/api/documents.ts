import {
  DOCUMENT_SIZE_ERROR_MESSAGE,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../../../../shared/document-limits';
import type { KnowledgeDocument } from '../types';

interface DocumentsResponse {
  documents: KnowledgeDocument[];
}

interface DocumentResponse {
  document: KnowledgeDocument;
}

export class KnowledgeApiError extends Error {
  readonly code: 'DOCUMENT_TOO_LARGE' | 'REQUEST_FAILED';

  constructor(message: string, code: 'DOCUMENT_TOO_LARGE' | 'REQUEST_FAILED' = 'REQUEST_FAILED') {
    super(message);
    this.name = 'KnowledgeApiError';
    this.code = code;
  }
}

export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const response = await fetch('/api/knowledge/documents');
  return (await readJson<DocumentsResponse>(response)).documents;
}

export async function uploadDocument(file: File): Promise<KnowledgeDocument> {
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new KnowledgeApiError(DOCUMENT_SIZE_ERROR_MESSAGE, 'DOCUMENT_TOO_LARGE');
  }

  const url = `/api/knowledge/documents?name=${encodeURIComponent(file.name)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  return (await readJson<DocumentResponse>(response)).document;
}

export async function deleteDocument(id: string): Promise<void> {
  await readJson(await fetch(`/api/knowledge/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }));
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok || !payload) {
    throw new KnowledgeApiError(payload?.message ?? 'تعذر إكمال طلب إدارة الكتب.');
  }
  return payload;
}
