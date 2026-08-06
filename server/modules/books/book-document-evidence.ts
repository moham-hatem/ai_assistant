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
    let editions;
    try {
      editions = await this.repository.listPublishedEditions();
    } catch (error) {
      if (error instanceof BookRepositoryUnavailableError) return { chunks: [], fileCount: 0 };
      throw error;
    }

    const chunks: Evidence[] = [];
    let fileCount = 0;
    for (const edition of editions) {
      const documentId = parseDocumentReference(edition.originalDocumentReference);
      if (!documentId) continue;
      try {
        const text = await this.documents.readText(documentId);
        chunkText(text).forEach((content, index) => {
          chunks.push({
            content,
            id: `books/${edition.bookId}/editions/${edition.id}:${index + 1}`,
          });
        });
        fileCount += 1;
      } catch {
        // Legacy or externally damaged records remain excluded instead of exposing untracked files.
      }
    }
    return { chunks, fileCount };
  }
}
