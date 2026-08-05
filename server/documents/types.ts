export type DocumentFormat = 'docx' | 'markdown' | 'pdf' | 'text';

export interface DocumentMetadata {
  characterCount: number;
  format: DocumentFormat;
  id: string;
  importedAt: string;
  name: string;
  size: number;
}

export interface DocumentExtractor {
  extract(buffer: Buffer): Promise<string>;
}

export interface DocumentImportInput {
  buffer: Buffer;
  name: string;
}

export type DocumentResourceKind = 'source' | 'text';

export interface DocumentResource {
  metadata: DocumentMetadata;
  path: string;
}
