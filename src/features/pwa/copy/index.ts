import type { AppLanguage } from '../../../i18n/language';
import { arPwaCopy } from './ar';
import { enPwaCopy } from './en';
import { swPwaCopy } from './sw';
import type { PwaCopy } from './types';

export const pwaCopies: Record<AppLanguage, PwaCopy> = {
  ar: arPwaCopy,
  en: enPwaCopy,
  sw: swPwaCopy,
};

export type { PwaCopy } from './types';
