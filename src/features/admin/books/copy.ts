import type { AppLanguage } from '../../../i18n/language';
import type { EditionStatus } from './types';

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
  transitionSuccess: (version: string, status: string) => string;
  updatedAt: string;
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
    legacyBadge: 'منفصل مؤقتًا', legacyBody: 'تدير هذه الأدوات ملفات قاعدة المعرفة القديمة فقط. الرفع هنا لا ينشئ إصدارًا ولا يغيّر دورة حالته.',
    legacyTitle: 'إدارة الملفات القديمة', listError: 'تعذر تحميل سجلات الكتب من الخادم.', loadingBooks: 'جارٍ تحميل الكتب…',
    loadingDetails: 'جارٍ تحميل تفاصيل الكتاب وإصداراته…', nextPage: 'الصفحة التالية', noAuthor: 'غير محدد', noSubject: 'غير محدد',
    notAvailable: 'غير متاح', previousPage: 'الصفحة السابقة', publishedAt: 'تاريخ النشر', refresh: 'تحديث', reference: 'مرجع الملف الأصلي',
    retry: 'إعادة المحاولة', selectBookBody: 'اختر كتابًا من القائمة لعرض بياناته وإصداراته وإجراءات الحالة المتاحة.',
    selectBookTitle: 'اختر كتابًا', status: 'الحالة',
    statuses: { archived: 'مؤرشف', draft: 'مسودة', processing: 'قيد المعالجة', published: 'منشور', ready: 'جاهز', rejected: 'مرفوض' },
    subject: 'الموضوع', transitionError: 'تعذر تغيير حالة الإصدار. ربما تغيرت حالته؛ حدّث التفاصيل وحاول مجددًا.',
    transitionSuccess: (version, status) => `انتقل الإصدار ${version} بنجاح إلى «${status}».`, updatedAt: 'آخر تحديث', version: 'الإصدار',
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
    legacyBadge: 'Temporarily separate', legacyBody: 'These tools manage legacy knowledge files only. Uploading here does not create an edition or change its lifecycle.',
    legacyTitle: 'Legacy file management', listError: 'Book records could not be loaded from the server.', loadingBooks: 'Loading books…',
    loadingDetails: 'Loading book details and editions…', nextPage: 'Next page', noAuthor: 'Not specified', noSubject: 'Not specified',
    notAvailable: 'Not available', previousPage: 'Previous page', publishedAt: 'Published', refresh: 'Refresh', reference: 'Original file reference',
    retry: 'Try again', selectBookBody: 'Select a book to inspect its metadata, editions, and available lifecycle actions.',
    selectBookTitle: 'Select a book', status: 'Status',
    statuses: { archived: 'Archived', draft: 'Draft', processing: 'Processing', published: 'Published', ready: 'Ready', rejected: 'Rejected' },
    subject: 'Subject', transitionError: 'The edition status could not be changed. It may have changed already; refresh the details and try again.',
    transitionSuccess: (version, status) => `Edition ${version} moved to “${status}”.`, updatedAt: 'Last updated', version: 'Version',
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
    legacyBadge: 'Imetengwa kwa muda', legacyBody: 'Zana hizi zinasimamia faili za zamani za maarifa pekee. Kupakia hapa hakuundi toleo wala kubadili mzunguko wake.',
    legacyTitle: 'Usimamizi wa faili za zamani', listError: 'Rekodi za vitabu hazikuweza kupakiwa kutoka kwenye seva.', loadingBooks: 'Inapakia vitabu…',
    loadingDetails: 'Inapakia maelezo ya kitabu na matoleo…', nextPage: 'Ukurasa unaofuata', noAuthor: 'Haijabainishwa', noSubject: 'Haijabainishwa',
    notAvailable: 'Haipatikani', previousPage: 'Ukurasa uliotangulia', publishedAt: 'Kilichapishwa', refresh: 'Onyesha upya', reference: 'Rejeleo la faili asili',
    retry: 'Jaribu tena', selectBookBody: 'Chagua kitabu kuona taarifa, matoleo, na vitendo vya hali vinavyopatikana.',
    selectBookTitle: 'Chagua kitabu', status: 'Hali',
    statuses: { archived: 'Kimehifadhiwa', draft: 'Rasimu', processing: 'Kinachakatwa', published: 'Kimechapishwa', ready: 'Tayari', rejected: 'Kimekataliwa' },
    subject: 'Mada', transitionError: 'Hali ya toleo haikuweza kubadilishwa. Huenda tayari imebadilika; pakia upya maelezo kisha ujaribu tena.',
    transitionSuccess: (version, status) => `Toleo ${version} limehamishwa hadi “${status}”.`, updatedAt: 'Ilisasishwa', version: 'Toleo',
    range: (start, end, total) => `${start}–${end} kati ya ${total}`,
  },
};
