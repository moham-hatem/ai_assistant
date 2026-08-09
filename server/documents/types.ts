import type { DocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';

export type DocumentFormat = 'docx' | 'markdown' | 'pdf' | 'text';

export interface DocumentMetadata {
  characterCount: number;
  format: DocumentFormat;
  id: string;
  importedAt: string;
  name: string;
  processing: DocumentProcessingSummary;
  size: number;
}

export interface DocumentExtractor {
  extract(buffer: Buffer): Promise<string>;
}

export interface DocumentImportInput {
  buffer: Buffer;
  id?: string;
  name: string;
}

export type DocumentResourceKind = 'source' | 'text';

export interface DocumentResource {
  metadata: DocumentMetadata;
  path: string;
}
