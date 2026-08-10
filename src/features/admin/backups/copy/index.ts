import type { AppLanguage } from '../../../../i18n/language';
import { ar } from './ar';
import { en } from './en';
import { sw } from './sw';
import type { BackupsCopy } from './types';

export const backupsCopies: Record<AppLanguage, BackupsCopy> = { ar, en, sw };
export type { BackupsCopy } from './types';
