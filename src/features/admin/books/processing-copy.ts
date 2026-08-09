import type {
  DocumentProcessingMethod,
  DocumentProcessingStatus,
} from '../../../../shared/contracts/document-processing.ts';
import type { AppLanguage } from '../../../i18n/language.ts';

export interface ProcessingCopy {
  actionErrors: { approve: string; reprocess: string };
  approve: string;
  approving: string;
  averageConfidence: string;
  closePreview: string;
  failureCode: string;
  loadError: string;
  loading: string;
  lowConfidencePages: string;
  method: string;
  methods: Record<DocumentProcessingMethod, string>;
  ocrPages: string;
  pageCount: string;
  preview: string;
  previewExtractedText: string;
  previewReadOnly: string;
  previewSource: string;
  processedAt: string;
  processingDetails: string;
  publishedLocked: string;
  reprocess: string;
  reprocessing: string;
  retry: string;
  statuses: Record<DocumentProcessingStatus, string>;
  unknownFailureCode: string;
}

export const processingCopies: Record<AppLanguage, ProcessingCopy> = {
  ar: {
    actionErrors: {
      approve: 'تعذّر اعتماد نتيجة المعالجة. حدّث الحالة وحاول مجددًا.',
      reprocess: 'تعذّرت إعادة معالجة المستند. بقيت آخر نتيجة معروضة دون تغيير.',
    },
    approve: 'اعتماد النتيجة', approving: 'جارٍ الاعتماد…', averageConfidence: 'متوسط الثقة',
    closePreview: 'إغلاق المعاينة', failureCode: 'رمز الفشل',
    loadError: 'تعذّر تحميل حالة معالجة هذا الإصدار.', loading: 'جارٍ تحميل حالة المعالجة…',
    lowConfidencePages: 'صفحات ضعيفة الثقة', method: 'طريقة الاستخراج',
    methods: { hybrid: 'هجين', native: 'نص أصلي', ocr: 'تعرّف ضوئي' },
    ocrPages: 'صفحات OCR', pageCount: 'عدد الصفحات', preview: 'معاينة المستند',
    previewExtractedText: 'النص المستخرج',
    previewReadOnly: 'معاينة للقراءة فقط؛ لا تنشر النص ولا تعدّله.',
    previewSource: 'المصدر الأصلي', processedAt: 'وقت المعالجة',
    processingDetails: 'معالجة المستند',
    publishedLocked: 'الإصدار المنشور لا يُعاد معالجته ولا تُعتمد نتيجته في مكانه.',
    reprocess: 'إعادة المعالجة', reprocessing: 'جارٍ إعادة المعالجة…', retry: 'إعادة المحاولة',
    statuses: {
      failed: 'فشلت المعالجة', ocr_required: 'يحتاج OCR', processing: 'قيد المعالجة',
      ready: 'جاهز', review_required: 'يحتاج مراجعة',
    },
    unknownFailureCode: 'PROCESSING_FAILED',
  },
  en: {
    actionErrors: {
      approve: 'The processing result could not be approved. Refresh its state and try again.',
      reprocess: 'The document could not be reprocessed. The last result remains unchanged.',
    },
    approve: 'Approve result', approving: 'Approving…', averageConfidence: 'Average confidence',
    closePreview: 'Close preview', failureCode: 'Failure code',
    loadError: 'This edition’s processing state could not be loaded.', loading: 'Loading processing state…',
    lowConfidencePages: 'Low-confidence pages', method: 'Extraction method',
    methods: { hybrid: 'Hybrid', native: 'Native text', ocr: 'OCR' },
    ocrPages: 'OCR pages', pageCount: 'Pages', preview: 'Document preview',
    previewExtractedText: 'Extracted text',
    previewReadOnly: 'Read-only preview; it does not publish or modify the text.',
    previewSource: 'Original source', processedAt: 'Processed at',
    processingDetails: 'Document processing',
    publishedLocked: 'Published editions cannot be reprocessed or approved in place.',
    reprocess: 'Reprocess', reprocessing: 'Reprocessing…', retry: 'Try again',
    statuses: {
      failed: 'Failed', ocr_required: 'OCR required', processing: 'Processing',
      ready: 'Ready', review_required: 'Review required',
    },
    unknownFailureCode: 'PROCESSING_FAILED',
  },
  sw: {
    actionErrors: {
      approve: 'Matokeo ya uchakataji hayakuweza kuidhinishwa. Pakia hali upya kisha ujaribu tena.',
      reprocess: 'Hati haikuweza kuchakatwa tena. Matokeo ya mwisho hayajabadilishwa.',
    },
    approve: 'Idhinisha matokeo', approving: 'Inaidhinisha…', averageConfidence: 'Wastani wa uhakika',
    closePreview: 'Funga hakikisho', failureCode: 'Msimbo wa hitilafu',
    loadError: 'Hali ya uchakataji ya toleo hili haikuweza kupakiwa.', loading: 'Inapakia hali ya uchakataji…',
    lowConfidencePages: 'Kurasa zenye uhakika mdogo', method: 'Mbinu ya kutoa maandishi',
    methods: { hybrid: 'Mseto', native: 'Maandishi asili', ocr: 'OCR' },
    ocrPages: 'Kurasa za OCR', pageCount: 'Kurasa', preview: 'Hakikisho la hati',
    previewExtractedText: 'Maandishi yaliyotolewa',
    previewReadOnly: 'Hakikisho la kusoma tu; halichapishi wala kubadilisha maandishi.',
    previewSource: 'Chanzo asili', processedAt: 'Ilichakatwa',
    processingDetails: 'Uchakataji wa hati',
    publishedLocked: 'Matoleo yaliyochapishwa hayawezi kuchakatwa tena wala kuidhinishwa hapa.',
    reprocess: 'Chakata tena', reprocessing: 'Inachakata tena…', retry: 'Jaribu tena',
    statuses: {
      failed: 'Imeshindwa', ocr_required: 'OCR inahitajika', processing: 'Inachakatwa',
      ready: 'Tayari', review_required: 'Mapitio yanahitajika',
    },
    unknownFailureCode: 'PROCESSING_FAILED',
  },
};
