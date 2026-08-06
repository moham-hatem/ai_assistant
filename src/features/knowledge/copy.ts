import type { AppLanguage } from '../../i18n/language';

export interface KnowledgeCopy {
  add: string;
  characters: (count: number) => string;
  chooseFile: string;
  closePreview: string;
  confirmDelete: (name: string) => string;
  deleteFile: (name: string) => string;
  empty: string;
  extracting: string;
  kilobytes: string;
  loading: string;
  megabytes: string;
  preview: string;
  previewContent: (name: string) => string;
  requestError: string;
  sizeError: string;
  supported: (size: number) => string;
  textFormat: string;
  title: string;
  view: string;
}

export const knowledgeCopies: Record<AppLanguage, KnowledgeCopy> = {
  ar: {
    add: 'إضافة إلى المعرفة', characters: (count) => `${count.toLocaleString('ar-EG')} حرف`, chooseFile: 'اختر ملفًا من الجهاز',
    closePreview: 'إغلاق المعاينة', confirmDelete: (name) => `هل تريد حذف «${name}» من قاعدة المعرفة القديمة؟`, deleteFile: (name) => `حذف ${name}`,
    empty: 'لم تتم إضافة ملفات بعد. استخدم النموذج بالأعلى.', extracting: 'جارٍ الاستخراج…', kilobytes: 'كيلوبايت', loading: 'جارٍ تحميل قائمة الملفات…',
    megabytes: 'ميجابايت', preview: 'معاينة المحتوى', previewContent: (name) => `محتوى ${name}`, requestError: 'تعذر إكمال طلب إدارة الملفات.',
    sizeError: 'حجم الملف يتجاوز الحد المسموح.', supported: (size) => `يدعم TXT وMarkdown وPDF وWord حتى ${size} ميجابايت.`, textFormat: 'نص',
    title: 'إضافة ملف قديم', view: 'عرض المحتوى',
  },
  en: {
    add: 'Add to knowledge', characters: (count) => `${count.toLocaleString('en-GB')} characters`, chooseFile: 'Choose a file',
    closePreview: 'Close preview', confirmDelete: (name) => `Delete “${name}” from the legacy knowledge base?`, deleteFile: (name) => `Delete ${name}`,
    empty: 'No files have been added. Use the form above.', extracting: 'Extracting…', kilobytes: 'KB', loading: 'Loading files…',
    megabytes: 'MB', preview: 'Content preview', previewContent: (name) => `Content of ${name}`, requestError: 'The file management request could not be completed.',
    sizeError: 'The file exceeds the allowed size.', supported: (size) => `Supports TXT, Markdown, PDF, and Word up to ${size} MB.`, textFormat: 'Text',
    title: 'Add a legacy file', view: 'View content',
  },
  sw: {
    add: 'Ongeza kwenye maarifa', characters: (count) => `Herufi ${count.toLocaleString('sw-KE')}`, chooseFile: 'Chagua faili',
    closePreview: 'Funga onyesho', confirmDelete: (name) => `Ufute “${name}” kwenye hazina ya zamani ya maarifa?`, deleteFile: (name) => `Futa ${name}`,
    empty: 'Hakuna faili zilizoongezwa. Tumia fomu iliyo juu.', extracting: 'Inachambua…', kilobytes: 'KB', loading: 'Inapakia faili…',
    megabytes: 'MB', preview: 'Onyesho la maudhui', previewContent: (name) => `Maudhui ya ${name}`, requestError: 'Ombi la kusimamia faili halikuweza kukamilika.',
    sizeError: 'Faili imezidi ukubwa unaoruhusiwa.', supported: (size) => `Inakubali TXT, Markdown, PDF, na Word hadi MB ${size}.`, textFormat: 'Maandishi',
    title: 'Ongeza faili ya zamani', view: 'Tazama maudhui',
  },
};
