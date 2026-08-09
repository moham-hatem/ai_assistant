import type { AppLanguage } from '../../../../i18n/language';
import { arQualityMetricsCopy } from './ar';
import { enQualityMetricsCopy } from './en';
import { swQualityMetricsCopy } from './sw';
import type { QualityMetricsCopy } from './types';

export const qualityMetricsCopies: Record<AppLanguage, QualityMetricsCopy> = {
  ar: arQualityMetricsCopy,
  en: enQualityMetricsCopy,
  sw: swQualityMetricsCopy,
};

export type { QualityMetricsCopy } from './types';
