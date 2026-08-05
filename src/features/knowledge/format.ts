import type { DocumentFormat } from './types';

const formatLabels: Record<DocumentFormat, string> = {
  docx: 'Word',
  markdown: 'Markdown',
  pdf: 'PDF',
  text: 'نص',
};

export function formatDocumentType(format: DocumentFormat): string {
  return formatLabels[format];
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`
    : `${(bytes / 1024 / 1024).toFixed(1)} ميجابايت`;
}

export function formatImportedAt(value: string): string {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}
