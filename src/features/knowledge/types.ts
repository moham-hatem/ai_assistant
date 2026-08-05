export type DocumentFormat = 'docx' | 'markdown' | 'pdf' | 'text';

export interface KnowledgeDocument {
  characterCount: number;
  format: DocumentFormat;
  id: string;
  importedAt: string;
  name: string;
  size: number;
}

export type KnowledgeStatus = 'idle' | 'loading' | 'saving';
