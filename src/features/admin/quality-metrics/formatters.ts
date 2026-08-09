import type { AppLanguage } from '../../../i18n/language';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en-US', sw: 'sw-TZ' };

export function formatCount(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(locales[language]).format(value);
}

export function formatPercent(value: number | null, language: AppLanguage): string {
  if (value === null) return '—';
  return new Intl.NumberFormat(locales[language], {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value);
}

export function formatDuration(value: number | null, language: AppLanguage): string {
  if (value === null) return '—';
  if (value < 60_000) return formatUnit(value / 1000, 'second', language);
  if (value < 3_600_000) return formatUnit(value / 60_000, 'minute', language);
  return formatUnit(value / 3_600_000, 'hour', language);
}

export function formatGeneratedAt(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatUnit(
  value: number,
  unit: 'hour' | 'minute' | 'second',
  language: AppLanguage,
): string {
  return new Intl.NumberFormat(locales[language], {
    maximumFractionDigits: 1,
    style: 'unit',
    unit,
    unitDisplay: 'short',
  }).format(value);
}
