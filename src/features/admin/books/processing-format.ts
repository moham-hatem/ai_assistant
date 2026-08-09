import type { AppLanguage } from '../../../i18n/language.ts';
import { formatBookDate } from './format.ts';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en-GB', sw: 'sw-KE' };

export function formatProcessingCount(value: number, language: AppLanguage): string {
  return value.toLocaleString(locales[language]);
}

export function formatProcessingConfidence(
  value: number | null,
  language: AppLanguage,
  fallback: string,
): string {
  return value === null
    ? fallback
    : new Intl.NumberFormat(locales[language], { style: 'percent', maximumFractionDigits: 1 })
      .format(value);
}

export function formatProcessingDate(
  value: string | null,
  language: AppLanguage,
  fallback: string,
): string {
  if (!value || Number.isNaN(Date.parse(value))) return fallback;
  return formatBookDate(value, language);
}
