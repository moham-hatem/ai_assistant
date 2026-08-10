import type { AppLanguage } from '../../../i18n/language';
import type { SecurityAuditMetadataValue } from '../../../../shared/contracts/security-audit';

const locales: Record<AppLanguage, string> = { ar: 'ar-EG', en: 'en', sw: 'sw' };

export function formatAuditDate(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(locales[language], { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatAuditValue(value: SecurityAuditMetadataValue, language: AppLanguage): string {
  if (typeof value === 'boolean') return language === 'ar' ? (value ? 'نعم' : 'لا') : (value ? 'Yes' : 'No');
  return typeof value === 'number' ? new Intl.NumberFormat(locales[language]).format(value) : value;
}

export function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
