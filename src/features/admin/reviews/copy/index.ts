import type { AppLanguage } from '../../../../i18n/language';
import { arReviewsCopy } from './ar';
import { enReviewsCopy } from './en';
import { swReviewsCopy } from './sw';
import type { ReviewsCopy } from './types';

export type { ReviewsCopy } from './types';

export const reviewsCopies: Record<AppLanguage, ReviewsCopy> = {
  ar: arReviewsCopy,
  en: enReviewsCopy,
  sw: swReviewsCopy,
};
