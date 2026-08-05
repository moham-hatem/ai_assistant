export type AppLanguage = 'ar' | 'en' | 'sw';

export interface LanguageOption {
  code: AppLanguage;
  dir: 'ltr' | 'rtl';
  label: string;
  nativeLabel: string;
}

export const languages: LanguageOption[] = [
  { code: 'ar', dir: 'rtl', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'en', dir: 'ltr', label: 'English', nativeLabel: 'English' },
  { code: 'sw', dir: 'ltr', label: 'Swahili', nativeLabel: 'Kiswahili' },
];

export function getLanguage(code: AppLanguage): LanguageOption {
  return languages.find((language) => language.code === code) ?? languages[0];
}

export function isAppLanguage(value: string | null): value is AppLanguage {
  return languages.some((language) => language.code === value);
}
