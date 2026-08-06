export const editionStatuses = [
  'draft',
  'processing',
  'ready',
  'published',
  'rejected',
  'archived',
] as const;

export type EditionStatus = typeof editionStatuses[number];

// Languages are deliberately stored as open text, not as a closed product-language union.
export type BookLanguage = string;

export interface Book {
  authorOrOrganization: string | null;
  createdAt: string;
  id: string;
  language: BookLanguage;
  subject: string | null;
  title: string;
  updatedAt: string;
}

export interface BookEdition {
  archivedAt: string | null;
  bookId: string;
  contentHash: string;
  createdAt: string;
  id: string;
  originalDocumentReference: string;
  publishedAt: string | null;
  status: EditionStatus;
  version: string;
}

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface PageQuery {
  limit: number;
  offset: number;
}
