import type { AppLanguage } from '../../../i18n/language';
import type { DocumentProcessingStatus } from '../../../../shared/contracts/document-processing';
import type { BookEditionUploadError, EditionStatus } from './types';

export interface BooksCopy {
  actions: Record<EditionStatus, string>;
  archivedAt: string;
  author: string;
  bookCount: (count: number) => string;
  bookDetails: string;
  bookLanguage: string;
  booksList: string;
  cancel: string;
  confirm: string;
  confirming: string;
  confirmBody: (version: string, action: string) => string;
  confirmTitle: string;
  createdAt: string;
  detailError: string;
  editionCount: (count: number) => string;
  editions: string;
  emptyBooksBody: string;
  emptyBooksTitle: string;
  emptyEditions: string;
  fingerprint: string;
  legacyBadge: string;
  legacyBody: string;
  legacyTitle: string;
  listError: string;
  loadingBooks: string;
  loadingDetails: string;
  nextPage: string;
  noAuthor: string;
  noSubject: string;
  notAvailable: string;
  previousPage: string;
  publishedAt: string;
  range: (start: number, end: number, total: number) => string;
  refresh: string;
  reference: string;
  retry: string;
  selectBookBody: string;
  selectBookTitle: string;
  status: string;
  statuses: Record<EditionStatus, string>;
  subject: string;
  transitionError: string;
  transitionRefreshError: string;
  transitionSuccess: (version: string, status: string) => string;
  updatedAt: string;
  uploadAction: string;
  uploadBadge: string;
  uploadBook: (title: string) => string;
  uploadChooseFile: string;
  uploadErrors: Record<BookEditionUploadError, string>;
  uploadLifecycle: string;
  uploadProgress: string;
  uploadProgressValue: (progress: number) => string;
  uploadSuccess: (version: string, processingStatus: DocumentProcessingStatus) => string;
  uploadSupported: (size: number) => string;
  uploadTitle: string;
  uploading: string;
  uploadVersion: string;
  uploadVersionPlaceholder: string;
  version: string;
}

export const booksCopies: Record<AppLanguage, BooksCopy> = {
  ar: {
    actions: { archived: 'أرشفة', draft: 'إعادة إلى المسودة', processing: 'بدء المعالجة', published: 'نشر', ready: 'تمييز كجاهز', rejected: 'رفض' },
    archivedAt: 'تاريخ الأرشفة', author: 'المؤلف أو الجهة', bookCount: (count) => `${count.toLocaleString('ar-EG')} كتاب`,
    bookDetails: 'تفاصيل الكتاب', bookLanguage: 'لغة الكتاب', booksList: 'قائمة الكتب', cancel: 'إلغاء', confirm: 'تأكيد الإجراء', confirming: 'جارٍ التنفيذ…',
    confirmBody: (version, action) => `سيتم تنفيذ «${action}» على الإصدار ${version}. يتحقق الخادم من صلاحية الانتقال مرة أخرى.`,
    confirmTitle: 'تأكيد انتقال حالة الإصدار', createdAt: 'تاريخ الإنشاء', detailError: 'تعذر تحميل تفاصيل الكتاب وإصداراته من الخادم.',
    editionCount: (count) => `${count.toLocaleString('ar-EG')} إصدار`, editions: 'الإصدارات',
    emptyBooksBody: 'أنشئ سجل كتاب وإصداراته عبر واجهات الخادم المعتمدة ليظهر هنا.', emptyBooksTitle: 'لا توجد سجلات كتب',
    emptyEditions: 'لا توجد إصدارات مسجلة لهذا الكتاب.', fingerprint: 'بصمة المحتوى (SHA-256)',
    legacyBadge: 'مسار توافق', legacyBody: 'استخدم هذا القسم فقط للتوافق مع العمل القديم: الرفع هنا ينشئ كتابًا ضمنيًا وإصدارًا منشورًا تلقائيًا. لإضافة إصدار جاهز دون نشره، استخدم نموذج الكتاب المحدد أعلاه.',
    legacyTitle: 'إدارة الملفات القديمة', listError: 'تعذر تحميل سجلات الكتب من الخادم.', loadingBooks: 'جارٍ تحميل الكتب…',
    loadingDetails: 'جارٍ تحميل تفاصيل الكتاب وإصداراته…', nextPage: 'الصفحة التالية', noAuthor: 'غير محدد', noSubject: 'غير محدد',
    notAvailable: 'غير متاح', previousPage: 'الصفحة السابقة', publishedAt: 'تاريخ النشر', refresh: 'تحديث', reference: 'مرجع الملف الأصلي',
    retry: 'إعادة المحاولة', selectBookBody: 'اختر كتابًا من القائمة لعرض بياناته وإصداراته وإجراءات الحالة المتاحة.',
    selectBookTitle: 'اختر كتابًا', status: 'الحالة',
    statuses: { archived: 'مؤرشف', draft: 'مسودة', processing: 'قيد المعالجة', published: 'منشور', ready: 'جاهز', rejected: 'مرفوض' },
    subject: 'الموضوع', transitionError: 'تعذر تغيير حالة الإصدار. ربما تغيرت حالته؛ حدّث التفاصيل وحاول مجددًا.',
    transitionRefreshError: 'تم تنفيذ الإجراء، لكن تعذر تحديث التفاصيل من الخادم. أعد تحميل التفاصيل للمزامنة.',
    transitionSuccess: (version, status) => `انتقل الإصدار ${version} بنجاح إلى «${status}».`, updatedAt: 'آخر تحديث',
    uploadAction: 'رفع الإصدار', uploadBadge: 'رفع مرتبط', uploadBook: (title) => `سيُضاف هذا الإصدار إلى «${title}».`,
    uploadChooseFile: 'اختر ملف الإصدار',
    uploadErrors: {
      'book-unavailable': 'الكتاب المحدد لم يعد متاحًا. حدّث القائمة واختر الكتاب مجددًا.',
      duplicate: 'هذا الملف مطابق لإصدار موجود في الكتاب. اختر ملفًا بمحتوى مختلف.',
      'empty-file': 'الملف فارغ. اختر ملفًا يحتوي على نص قابل للاستخراج.',
      extraction: 'تعذر استخراج نص كافٍ من الملف. تحقق من سلامته ومحتواه ثم حاول مجددًا.',
      'file-size': 'حجم الملف يتجاوز الحد المسموح.',
      'file-type': 'نوع الملف غير مدعوم. استخدم TXT أو Markdown أو PDF أو Word.',
      'invalid-version': 'أدخل اسم إصدار واضحًا لا يتجاوز 100 حرف.',
      unavailable: 'تعذر الوصول إلى خدمة الكتب الآن. حاول مجددًا بعد قليل.',
    },
    uploadLifecycle: 'يحفظ الرفع الإصدار دون نشره؛ وقد يبقى قيد المعالجة إذا احتاج OCR أو مراجعة.', uploadProgress: 'تقدم رفع الإصدار',
    uploadProgressValue: (progress) => `تم رفع ${progress.toLocaleString('ar-EG')}٪`,
    uploadSuccess: uploadSuccessAr,
    uploadSupported: (size) => `ملف TXT أو Markdown أو PDF أو Word، بحد أقصى ${size} ميجابايت.`,
    uploadTitle: 'إضافة إصدار جديد', uploading: 'جارٍ الرفع والاستخراج…', uploadVersion: 'اسم الإصدار (مطلوب)',
    uploadVersionPlaceholder: 'مثال: 2.0 أو طبعة 1448هـ', version: 'الإصدار',
    range: (start, end, total) => `${start.toLocaleString('ar-EG')}–${end.toLocaleString('ar-EG')} من ${total.toLocaleString('ar-EG')}`,
  },
  en: {
    actions: { archived: 'Archive', draft: 'Return to draft', processing: 'Start processing', published: 'Publish', ready: 'Mark ready', rejected: 'Reject' },
    archivedAt: 'Archived', author: 'Author or organization', bookCount: (count) => `${count} ${count === 1 ? 'book' : 'books'}`,
    bookDetails: 'Book details', bookLanguage: 'Book language', booksList: 'Books', cancel: 'Cancel', confirm: 'Confirm action', confirming: 'Applying…',
    confirmBody: (version, action) => `This will ${action.toLowerCase()} edition ${version}. The server will validate the transition again.`,
    confirmTitle: 'Confirm edition status change', createdAt: 'Created', detailError: 'The book details and editions could not be loaded from the server.',
    editionCount: (count) => `${count} ${count === 1 ? 'edition' : 'editions'}`, editions: 'Editions',
    emptyBooksBody: 'Create a book record and its editions through the supported server APIs to see them here.', emptyBooksTitle: 'No book records',
    emptyEditions: 'No editions are registered for this book.', fingerprint: 'Content fingerprint (SHA-256)',
    legacyBadge: 'Compatibility path', legacyBody: 'Use this section only for the legacy workflow: an upload creates an implicit book and publishes its edition automatically. To add a ready, unpublished edition, use the selected book form above.',
    legacyTitle: 'Legacy file management', listError: 'Book records could not be loaded from the server.', loadingBooks: 'Loading books…',
    loadingDetails: 'Loading book details and editions…', nextPage: 'Next page', noAuthor: 'Not specified', noSubject: 'Not specified',
    notAvailable: 'Not available', previousPage: 'Previous page', publishedAt: 'Published', refresh: 'Refresh', reference: 'Original file reference',
    retry: 'Try again', selectBookBody: 'Select a book to inspect its metadata, editions, and available lifecycle actions.',
    selectBookTitle: 'Select a book', status: 'Status',
    statuses: { archived: 'Archived', draft: 'Draft', processing: 'Processing', published: 'Published', ready: 'Ready', rejected: 'Rejected' },
    subject: 'Subject', transitionError: 'The edition status could not be changed. It may have changed already; refresh the details and try again.',
    transitionRefreshError: 'The action completed, but fresh details could not be loaded. Retry the details to synchronize this view.',
    transitionSuccess: (version, status) => `Edition ${version} moved to “${status}”.`, updatedAt: 'Last updated',
    uploadAction: 'Upload edition', uploadBadge: 'Linked upload', uploadBook: (title) => `This edition will be added to “${title}”.`,
    uploadChooseFile: 'Choose the edition file',
    uploadErrors: {
      'book-unavailable': 'The selected book is no longer available. Refresh the list and select it again.',
      duplicate: 'This file matches an edition already in the book. Choose a file with different content.',
      'empty-file': 'The file is empty. Choose a file with extractable text.',
      extraction: 'Enough text could not be extracted. Check that the file is valid and contains text, then try again.',
      'file-size': 'The file exceeds the allowed size.',
      'file-type': 'This file type is not supported. Use TXT, Markdown, PDF, or Word.',
      'invalid-version': 'Enter a clear version name no longer than 100 characters.',
      unavailable: 'The book service is unavailable right now. Try again shortly.',
    },
    uploadLifecycle: 'Upload saves without publishing; scanned files may remain Processing for OCR or review.', uploadProgress: 'Edition upload progress',
    uploadProgressValue: (progress) => `${progress}% uploaded`,
    uploadSuccess: uploadSuccessEn,
    uploadSupported: (size) => `TXT, Markdown, PDF, or Word, up to ${size} MB.`, uploadTitle: 'Add a new edition',
    uploading: 'Uploading and extracting…', uploadVersion: 'Version name (required)', uploadVersionPlaceholder: 'For example, 2.0 or 2026 edition',
    version: 'Version',
    range: (start, end, total) => `${start}–${end} of ${total}`,
  },
  sw: {
    actions: { archived: 'Hifadhi', draft: 'Rudisha rasimu', processing: 'Anza kuchakata', published: 'Chapisha', ready: 'Weka tayari', rejected: 'Kataa' },
    archivedAt: 'Ilihifadhiwa', author: 'Mwandishi au shirika', bookCount: (count) => `Vitabu ${count}`,
    bookDetails: 'Maelezo ya kitabu', bookLanguage: 'Lugha ya kitabu', booksList: 'Vitabu', cancel: 'Ghairi', confirm: 'Thibitisha kitendo', confirming: 'Inatekeleza…',
    confirmBody: (version, action) => `Kitendo “${action}” kitatekelezwa kwa toleo ${version}. Seva itakagua tena uhalali wa mabadiliko.`,
    confirmTitle: 'Thibitisha mabadiliko ya hali', createdAt: 'Kiliundwa', detailError: 'Maelezo ya kitabu na matoleo hayakuweza kupakiwa kutoka kwenye seva.', editionCount: (count) => `Matoleo ${count}`, editions: 'Matoleo',
    emptyBooksBody: 'Unda rekodi ya kitabu na matoleo yake kupitia API za seva ili vionekane hapa.', emptyBooksTitle: 'Hakuna rekodi za vitabu',
    emptyEditions: 'Hakuna matoleo yaliyosajiliwa kwa kitabu hiki.', fingerprint: 'Alama ya maudhui (SHA-256)',
    legacyBadge: 'Njia ya uoanifu', legacyBody: 'Tumia sehemu hii kwa mtiririko wa zamani pekee: upakiaji huunda kitabu cha ndani na kuchapisha toleo lake moja kwa moja. Ili kuongeza toleo lililo tayari bila kulichapisha, tumia fomu ya kitabu kilichochaguliwa hapo juu.',
    legacyTitle: 'Usimamizi wa faili za zamani', listError: 'Rekodi za vitabu hazikuweza kupakiwa kutoka kwenye seva.', loadingBooks: 'Inapakia vitabu…',
    loadingDetails: 'Inapakia maelezo ya kitabu na matoleo…', nextPage: 'Ukurasa unaofuata', noAuthor: 'Haijabainishwa', noSubject: 'Haijabainishwa',
    notAvailable: 'Haipatikani', previousPage: 'Ukurasa uliotangulia', publishedAt: 'Kilichapishwa', refresh: 'Onyesha upya', reference: 'Rejeleo la faili asili',
    retry: 'Jaribu tena', selectBookBody: 'Chagua kitabu kuona taarifa, matoleo, na vitendo vya hali vinavyopatikana.',
    selectBookTitle: 'Chagua kitabu', status: 'Hali',
    statuses: { archived: 'Kimehifadhiwa', draft: 'Rasimu', processing: 'Kinachakatwa', published: 'Kimechapishwa', ready: 'Tayari', rejected: 'Kimekataliwa' },
    subject: 'Mada', transitionError: 'Hali ya toleo haikuweza kubadilishwa. Huenda tayari imebadilika; pakia upya maelezo kisha ujaribu tena.',
    transitionRefreshError: 'Kitendo kimekamilika, lakini maelezo mapya hayakuweza kupakiwa. Jaribu kupakia maelezo tena ili kulandanisha ukurasa.',
    transitionSuccess: (version, status) => `Toleo ${version} limehamishwa hadi “${status}”.`, updatedAt: 'Ilisasishwa',
    uploadAction: 'Pakia toleo', uploadBadge: 'Upakiaji uliounganishwa', uploadBook: (title) => `Toleo hili litaongezwa kwenye “${title}”.`,
    uploadChooseFile: 'Chagua faili ya toleo',
    uploadErrors: {
      'book-unavailable': 'Kitabu kilichochaguliwa hakipatikani tena. Pakia upya orodha kisha ukichague tena.',
      duplicate: 'Faili hii inafanana na toleo lililopo kwenye kitabu. Chagua faili yenye maudhui tofauti.',
      'empty-file': 'Faili haina maudhui. Chagua faili yenye maandishi yanayoweza kutolewa.',
      extraction: 'Maandishi ya kutosha hayakuweza kutolewa. Hakikisha faili ni sahihi na ina maandishi, kisha ujaribu tena.',
      'file-size': 'Faili imezidi ukubwa unaoruhusiwa.',
      'file-type': 'Aina hii ya faili haikubaliki. Tumia TXT, Markdown, PDF, au Word.',
      'invalid-version': 'Weka jina wazi la toleo lisilozidi herufi 100.',
      unavailable: 'Huduma ya vitabu haipatikani sasa. Jaribu tena baada ya muda mfupi.',
    },
    uploadLifecycle: 'Upakiaji huhifadhi bila kuchapisha; faili zilizochanganuliwa zinaweza kubaki zikichakatwa kwa OCR au mapitio.', uploadProgress: 'Maendeleo ya kupakia toleo',
    uploadProgressValue: (progress) => `${progress}% imepakiwa`,
    uploadSuccess: uploadSuccessSw,
    uploadSupported: (size) => `TXT, Markdown, PDF, au Word, hadi MB ${size}.`, uploadTitle: 'Ongeza toleo jipya',
    uploading: 'Inapakia na kutoa maandishi…', uploadVersion: 'Jina la toleo (linahitajika)', uploadVersionPlaceholder: 'Kwa mfano, 2.0 au toleo la 2026',
    version: 'Toleo',
    range: (start, end, total) => `${start}–${end} kati ya ${total}`,
  },
};

function uploadSuccessAr(version: string, status: DocumentProcessingStatus): string {
  if (status === 'ready') return `أُضيف الإصدار ${version} بحالة «جاهز». يمكنك نشره لاحقًا من إجراءات الإصدار.`;
  if (status === 'ocr_required') return `حُفظ الإصدار ${version} وهو يحتاج إلى OCR. راجع حالة المعالجة وأعد المحاولة عند توفرها.`;
  if (status === 'review_required') return `حُفظ الإصدار ${version} وهو يحتاج مراجعة نتيجة OCR قبل اعتماده.`;
  return `حُفظ الإصدار ${version} وهو قيد معالجة المستند.`;
}

function uploadSuccessEn(version: string, status: DocumentProcessingStatus): string {
  if (status === 'ready') return `Edition ${version} was added as Ready. You can publish it later from its actions.`;
  if (status === 'ocr_required') return `Edition ${version} was saved and requires OCR. Review its processing state and retry when available.`;
  if (status === 'review_required') return `Edition ${version} was saved and its OCR result requires review before approval.`;
  return `Edition ${version} was saved and document processing is in progress.`;
}

function uploadSuccessSw(version: string, status: DocumentProcessingStatus): string {
  if (status === 'ready') return `Toleo ${version} limeongezwa kama Tayari. Unaweza kulichapisha baadaye kupitia vitendo vyake.`;
  if (status === 'ocr_required') return `Toleo ${version} limehifadhiwa na linahitaji OCR. Kagua hali ya uchakataji kisha ujaribu tena inapopatikana.`;
  if (status === 'review_required') return `Toleo ${version} limehifadhiwa na matokeo ya OCR yanahitaji mapitio kabla ya kuidhinishwa.`;
  return `Toleo ${version} limehifadhiwa na hati inaendelea kuchakatwa.`;
}
