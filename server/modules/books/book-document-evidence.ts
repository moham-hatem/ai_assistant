import type { Evidence } from '../../domain.ts';
import type { DocumentStore } from '../../documents/document-store.ts';
import { chunkText } from '../../knowledge/chunk-text.ts';
import type { PublishedEvidenceSource } from '../../knowledge/published-evidence-source.ts';
import type { BookRepository } from './book-repository.ts';
import { BookRepositoryUnavailableError } from './book-repository.ts';
import { parseDocumentReference } from './document-reference.ts';

export class BookDocumentEvidenceSource implements PublishedEvidenceSource {
  private readonly repository: BookRepository;
  private readonly documents: DocumentStore;

  constructor(
    repository: BookRepository,
    documents: DocumentStore,
  ) {
    this.repository = repository;
    this.documents = documents;
  }

  async load(): Promise<{ chunks: Evidence[]; fileCount: number }> {
    // Uploads create the edition link before metadata, so this ordering cannot grandfather a draft.
    const documents = await this.documents.list();
    let editions;
    try {
      editions = await this.repository.listDocumentEditions();
    } catch (error) {
      if (error instanceof BookRepositoryUnavailableError) return { chunks: [], fileCount: 0 };
      throw error;
    }

    const chunks: Evidence[] = [];
    const linkedDocumentIds = new Set<string>();
    const loadedDocumentIds = new Set<string>();
    let fileCount = 0;

    for (const edition of editions) {
      const documentId = parseDocumentReference(edition.originalDocumentReference);
      if (!documentId) continue;
      linkedDocumentIds.add(documentId);
      if (edition.status !== 'published' || loadedDocumentIds.has(documentId)) continue;
      try {
        const text = await this.documents.readText(documentId);
        appendChunks(chunks, text, `books/${edition.bookId}/editions/${edition.id}`);
        loadedDocumentIds.add(documentId);
        fileCount += 1;
      } catch {
        // Externally damaged published records remain excluded instead of exposing untracked files.
      }
    }

    for (const document of documents) {
      if (linkedDocumentIds.has(document.id) || loadedDocumentIds.has(document.id)) continue;
      try {
        appendChunks(
          chunks,
          await this.documents.readText(document.id),
          `legacy/documents/${document.id}`,
        );
        loadedDocumentIds.add(document.id);
        fileCount += 1;
      } catch {
        // Metadata without readable extracted text is not a usable grandfathered source.
      }
    }

    return { chunks, fileCount };
  }
}

function appendChunks(chunks: Evidence[], text: string, sourceId: string): void {
  chunkText(text).forEach((content, index) => {
    chunks.push({ content, id: `${sourceId}:${index + 1}` });
  });
}
