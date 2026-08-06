import type { DocumentFormat } from './types';
import type { AppLanguage } from '../../i18n/language';
import type { KnowledgeCopy } from './copy';

const formatLabels: Record<DocumentFormat, string> = {
  docx: 'Word',
  markdown: 'Markdown',
  pdf: 'PDF',
  text: '',
};

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en-GB', sw: 'sw-KE' };

export function formatDocumentType(format: DocumentFormat, copy: KnowledgeCopy): string {
  return format === 'text' ? copy.textFormat : formatLabels[format];
}

export function formatFileSize(bytes: number, language: AppLanguage, copy: KnowledgeCopy): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locales[language])} ${copy.kilobytes}`
    : `${(bytes / 1024 / 1024).toLocaleString(locales[language], { maximumFractionDigits: 1 })} ${copy.megabytes}`;
}

export function formatImportedAt(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}
