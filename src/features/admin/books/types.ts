import type { Book, BookEdition, EditionStatus, Page } from '../../../../shared/contracts/books';
import type {
  DocumentProcessingState,
  DocumentProcessingSummary,
} from '../../../../shared/contracts/document-processing';

export type { Book, BookEdition, EditionStatus };
export type BookPage = Page<Book>;
export type EditionPage = Page<BookEdition>;
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BookDocumentMetadata {
  characterCount: number;
  format: 'docx' | 'markdown' | 'pdf' | 'text';
  id: string;
  importedAt: string;
  name: string;
  processing: DocumentProcessingSummary;
  size: number;
}

export type EditionProcessingAction = 'approve' | 'reprocess';

export interface EditionProcessingEntry {
  action: EditionProcessingAction | null;
  actionError: EditionProcessingAction | null;
  phase: 'loading' | 'ready' | 'error';
  processing: DocumentProcessingState | null;
}

export type EditionProcessingEntries = Record<string, EditionProcessingEntry>;

export interface EditionProcessingApprovalResult {
  edition: BookEdition;
  processing: DocumentProcessingState;
}

export interface BookEditionUploadResult {
  book: Book;
  document: BookDocumentMetadata;
  edition: BookEdition;
}

export type BookEditionUploadError =
  | 'book-unavailable'
  | 'duplicate'
  | 'empty-file'
  | 'extraction'
  | 'file-size'
  | 'file-type'
  | 'invalid-version'
  | 'unavailable';

export interface BookEditionUploadState {
  error: BookEditionUploadError | null;
  processingStatus: DocumentProcessingSummary['status'] | null;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  version: string | null;
}

export interface PendingTransition {
  edition: BookEdition;
  targetStatus: EditionStatus;
}
