import type { AppLanguage } from '../../../../i18n/language';
import { arSystemDiagnosticsCopy } from './ar';
import { enSystemDiagnosticsCopy } from './en';
import { swSystemDiagnosticsCopy } from './sw';
import type { SystemDiagnosticsCopy } from './types';

export const systemDiagnosticsCopies: Record<AppLanguage, SystemDiagnosticsCopy> = {
  ar: arSystemDiagnosticsCopy,
  en: enSystemDiagnosticsCopy,
  sw: swSystemDiagnosticsCopy,
};

export type { SystemDiagnosticsCopy } from './types';
