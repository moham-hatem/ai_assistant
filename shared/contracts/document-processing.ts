export const documentProcessingStatuses = [
  'ready',
  'ocr_required',
  'processing',
  'review_required',
  'failed',
] as const;

export type DocumentProcessingStatus = typeof documentProcessingStatuses[number];

export const documentProcessingMethods = ['native', 'ocr', 'hybrid'] as const;

export type DocumentProcessingMethod = typeof documentProcessingMethods[number];

export interface DocumentProcessingSummary {
  averageConfidence: number | null;
  failureCode: string | null;
  lowConfidencePageCount: number;
  method: DocumentProcessingMethod;
  ocrPageCount: number;
  pageCount: number;
  processedAt: string | null;
  status: DocumentProcessingStatus;
}

export interface DocumentProcessingState {
  generation: number;
  summary: DocumentProcessingSummary;
}

export const legacyDocumentProcessingSummary: Readonly<DocumentProcessingSummary> = {
  averageConfidence: null,
  failureCode: null,
  lowConfidencePageCount: 0,
  method: 'native',
  ocrPageCount: 0,
  pageCount: 0,
  processedAt: null,
  status: 'ready',
};

export function normalizeDocumentProcessingSummary(value: unknown): DocumentProcessingSummary {
  if (!isRecord(value)) return { ...legacyDocumentProcessingSummary };
  return {
    averageConfidence: confidence(value.averageConfidence),
    failureCode: nullableString(value.failureCode),
    lowConfidencePageCount: count(value.lowConfidencePageCount),
    method: includes(documentProcessingMethods, value.method) ? value.method : 'native',
    ocrPageCount: count(value.ocrPageCount),
    pageCount: count(value.pageCount),
    processedAt: nullableString(value.processedAt),
    status: includes(documentProcessingStatuses, value.status) ? value.status : 'ready',
  };
}

export function parseDocumentProcessingSummary(value: unknown): DocumentProcessingSummary {
  if (!isRecord(value)
    || !includes(documentProcessingStatuses, value.status)
    || !includes(documentProcessingMethods, value.method)
    || !validCount(value.pageCount)
    || !validCount(value.ocrPageCount)
    || !validCount(value.lowConfidencePageCount)
    || !validConfidence(value.averageConfidence)
    || !validNullableString(value.processedAt)
    || !validNullableString(value.failureCode)) {
    throw new TypeError('Invalid document processing summary.');
  }
  return value as unknown as DocumentProcessingSummary;
}

export function normalizeDocumentProcessingGeneration(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function confidence(value: unknown): number | null {
  return validConfidence(value) && value !== null
    ? value
    : null;
}

function count(value: unknown): number {
  return validCount(value) ? value : 0;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function validConfidence(value: unknown): value is number | null {
  return value === null
    || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function includes<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
