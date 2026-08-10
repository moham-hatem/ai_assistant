import type { AppLanguage } from '../../../i18n/language';
import type { SafeDiagnosticLocation } from './types';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en', sw: 'sw' };

export function formatDiagnosticsDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

export function formatSpace(value: number, language: AppLanguage): string {
  return `${new Intl.NumberFormat(locales[language]).format(value)} MiB`;
}

export function locationLabel(
  location: SafeDiagnosticLocation,
  scopes: Record<SafeDiagnosticLocation['scope'], string>,
): string {
  return location.relativePath ?? scopes[location.scope];
}
