import type { AppLanguage } from '../../../i18n/language';
import type {
  SecurityAuditAction,
  SecurityAuditCategory,
  SecurityAuditOutcome,
  SecurityAuditSubjectType,
} from '../../../../shared/contracts/security-audit';

export interface SecurityAuditCopy {
  action: string;
  actor: string;
  all: string;
  apply: string;
  category: string;
  checkedAt: string;
  emptyBody: string;
  emptyTitle: string;
  errorBody: string;
  errorTitle: string;
  eventHash: string;
  filterHint: string;
  filters: string;
  firstInvalid: string;
  from: string;
  integrity: string;
  integrityNote: string;
  keyVersions: string;
  loading: string;
  metadata: string;
  next: string;
  noActor: string;
  noMetadata: string;
  outcome: string;
  previous: string;
  requestId: string;
  retry: string;
  sequence: string;
  subject: string;
  subjectId: string;
  subjectType: string;
  timestamp: string;
  title: string;
  intro: string;
  to: string;
  validation: Record<'invalid-time' | 'invalid-range' | 'invalid-identifier', string>;
  range: (start: number, end: number, total: number) => string;
  actions: Record<SecurityAuditAction, string>;
  categories: Record<SecurityAuditCategory, string>;
  outcomes: Record<SecurityAuditOutcome, string>;
  subjects: Record<SecurityAuditSubjectType, string>;
  integrityStatuses: Record<'valid' | 'invalid' | 'unverifiable', string>;
}

const englishActions = Object.fromEntries([
  ['auth.login', 'Signed in'], ['auth.logout', 'Signed out'], ['auth.session_revoked', 'Session revoked'],
  ['access.user_profile_changed', 'User profile changed'], ['access.user_roles_changed', 'User roles changed'],
  ['access.user_enabled', 'User enabled'], ['access.user_disabled', 'User disabled'],
  ['access.user_sessions_revoked', 'User sessions revoked'], ['access.invitation_created', 'Invitation created'],
  ['access.invitation_revoked', 'Invitation revoked'], ['access.invitation_redeemed', 'Invitation redeemed'],
  ['access.recovery_created', 'Recovery created'], ['access.recovery_revoked', 'Recovery revoked'],
  ['access.recovery_redeemed', 'Recovery redeemed'], ['authorization.denied', 'Authorization denied'],
  ['book.edition_status_changed', 'Edition status changed'], ['book.edition_published', 'Edition published'],
  ['book.edition_restored', 'Edition restored'], ['document.ocr_approved', 'OCR approved'],
  ['review.status_changed', 'Review status changed'], ['review.decision_recorded', 'Review decision recorded'],
] as Array<[SecurityAuditAction, string]>) as Record<SecurityAuditAction, string>;

const arabicActions: Record<SecurityAuditAction, string> = {
  'auth.login': 'تسجيل الدخول', 'auth.logout': 'تسجيل الخروج', 'auth.session_revoked': 'إلغاء جلسة',
  'access.user_profile_changed': 'تعديل ملف مستخدم', 'access.user_roles_changed': 'تعديل أدوار مستخدم',
  'access.user_enabled': 'تفعيل مستخدم', 'access.user_disabled': 'تعطيل مستخدم',
  'access.user_sessions_revoked': 'إلغاء جلسات مستخدم', 'access.invitation_created': 'إنشاء دعوة',
  'access.invitation_revoked': 'إلغاء دعوة', 'access.invitation_redeemed': 'استخدام دعوة',
  'access.recovery_created': 'إنشاء رابط استعادة', 'access.recovery_revoked': 'إلغاء رابط استعادة',
  'access.recovery_redeemed': 'استخدام رابط استعادة', 'authorization.denied': 'رفض صلاحية',
  'book.edition_status_changed': 'تغيير حالة إصدار', 'book.edition_published': 'نشر إصدار',
  'book.edition_restored': 'استعادة إصدار', 'document.ocr_approved': 'اعتماد النص المستخرج',
  'review.status_changed': 'تغيير حالة مراجعة', 'review.decision_recorded': 'تسجيل قرار مراجعة',
};

const swahiliActions: Record<SecurityAuditAction, string> = {
  'auth.login': 'Kuingia', 'auth.logout': 'Kutoka', 'auth.session_revoked': 'Kikao kimebatilishwa',
  'access.user_profile_changed': 'Wasifu wa mtumiaji umebadilishwa', 'access.user_roles_changed': 'Majukumu ya mtumiaji yamebadilishwa',
  'access.user_enabled': 'Mtumiaji amewezeshwa', 'access.user_disabled': 'Mtumiaji amezimwa',
  'access.user_sessions_revoked': 'Vikao vya mtumiaji vimebatilishwa', 'access.invitation_created': 'Mwaliko umeundwa',
  'access.invitation_revoked': 'Mwaliko umebatilishwa', 'access.invitation_redeemed': 'Mwaliko umetumiwa',
  'access.recovery_created': 'Urejeshaji umeundwa', 'access.recovery_revoked': 'Urejeshaji umebatilishwa',
  'access.recovery_redeemed': 'Urejeshaji umetumiwa', 'authorization.denied': 'Ruhusa imekataliwa',
  'book.edition_status_changed': 'Hali ya toleo imebadilishwa', 'book.edition_published': 'Toleo limechapishwa',
  'book.edition_restored': 'Toleo limerejeshwa', 'document.ocr_approved': 'OCR imeidhinishwa',
  'review.status_changed': 'Hali ya mapitio imebadilishwa', 'review.decision_recorded': 'Uamuzi wa mapitio umerekodiwa',
};

const en: SecurityAuditCopy = {
  action: 'Action', actor: 'Actor ID', all: 'All', apply: 'Apply filters', category: 'Category',
  checkedAt: 'Checked at', emptyBody: 'Events will appear here after protected administrative operations.',
  emptyTitle: 'No matching security events', errorBody: 'The protected audit service could not be read.',
  errorTitle: 'Security log unavailable',
  eventHash: 'Event hash', filterHint: 'Use exact IDs when narrowing the log.', filters: 'Audit filters',
  firstInvalid: 'First invalid sequence', from: 'From', integrity: 'Chain integrity',
  integrityNote: 'The authenticated local head detects local history changes while its key and head remain trusted. It is tamper-evident, not an external or tamper-proof archive.',
  keyVersions: 'Key versions', loading: 'Loading the protected security log…', metadata: 'Minimized metadata',
  next: 'Next page', noActor: 'System or unauthenticated action', noMetadata: 'No metadata', outcome: 'Outcome',
  previous: 'Previous page', requestId: 'Request ID', retry: 'Try again', sequence: 'Sequence',
  subject: 'Subject', subjectId: 'Subject ID', subjectType: 'Subject type', timestamp: 'Time',
  title: 'Security audit', intro: 'Inspect minimized, append-only administrative events and verify the local authenticated chain.', to: 'To',
  validation: { 'invalid-time': 'Enter valid dates.', 'invalid-range': 'The start date must not be after the end date.', 'invalid-identifier': 'One of the exact IDs has an invalid format.' },
  range: (start, end, total) => `${start}–${end} of ${total}`,
  actions: englishActions,
  categories: { access: 'Access', authentication: 'Authentication', authorization: 'Authorization', books: 'Books', documents: 'Documents', reviews: 'Reviews' },
  outcomes: { success: 'Success', denied: 'Denied', failure: 'Failure' },
  subjects: { user: 'User', session: 'Session', invitation: 'Invitation', recovery: 'Recovery', book_edition: 'Book edition', document: 'Document', review_item: 'Review item' },
  integrityStatuses: { valid: 'Valid', invalid: 'Invalid', unverifiable: 'Unverifiable' },
};

const ar: SecurityAuditCopy = {
  ...en,
  action: 'العملية', actor: 'معرّف المنفّذ', all: 'الكل', apply: 'تطبيق الفلاتر', category: 'الفئة',
  checkedAt: 'وقت الفحص', emptyBody: 'ستظهر الأحداث هنا بعد تنفيذ عمليات إدارية محمية.',
  emptyTitle: 'لا توجد أحداث أمان مطابقة', errorBody: 'تعذّرت قراءة خدمة سجل الأمان المحمية.',
  errorTitle: 'سجل الأمان غير متاح',
  eventHash: 'بصمة الحدث', filterHint: 'استخدم المعرّفات كاملة عند تضييق نتائج السجل.', filters: 'فلاتر سجل الأمان',
  firstInvalid: 'أول تسلسل غير صالح', from: 'من', integrity: 'سلامة السلسلة',
  integrityNote: 'يكشف الرأس المحلي الموثّق تغييرات السجل ما دام الرأس ومفتاحه موثوقين. هذه حماية تكشف العبث، وليست أرشيفًا خارجيًا أو حماية تمنع العبث نهائيًا.',
  keyVersions: 'إصدارات المفتاح', loading: 'جارٍ تحميل سجل الأمان المحمي…', metadata: 'بيانات مختصرة',
  next: 'الصفحة التالية', noActor: 'عملية من النظام أو بدون تسجيل دخول', noMetadata: 'لا توجد بيانات إضافية', outcome: 'النتيجة',
  previous: 'الصفحة السابقة', requestId: 'معرّف الطلب', retry: 'إعادة المحاولة', sequence: 'التسلسل',
  subject: 'العنصر المتأثر', subjectId: 'معرّف العنصر', subjectType: 'نوع العنصر', timestamp: 'الوقت',
  title: 'سجل الأمان', intro: 'راجع الأحداث الإدارية المختصرة غير القابلة للتعديل من التطبيق، وتحقق من سلامة السلسلة المحلية الموثّقة.', to: 'إلى',
  validation: { 'invalid-time': 'أدخل تاريخًا صحيحًا.', 'invalid-range': 'يجب ألا يكون تاريخ البداية بعد تاريخ النهاية.', 'invalid-identifier': 'صيغة أحد المعرّفات غير صحيحة.' },
  range: (start, end, total) => `${start.toLocaleString('ar-EG')}–${end.toLocaleString('ar-EG')} من ${total.toLocaleString('ar-EG')}`,
  actions: arabicActions,
  categories: { access: 'الوصول', authentication: 'تسجيل الدخول', authorization: 'الصلاحيات', books: 'الكتب', documents: 'المستندات', reviews: 'المراجعات' },
  outcomes: { success: 'نجاح', denied: 'مرفوض', failure: 'فشل' },
  subjects: { user: 'مستخدم', session: 'جلسة', invitation: 'دعوة', recovery: 'استعادة', book_edition: 'إصدار كتاب', document: 'مستند', review_item: 'عنصر مراجعة' },
  integrityStatuses: { valid: 'سليمة', invalid: 'غير سليمة', unverifiable: 'تعذّر التحقق' },
};

const sw: SecurityAuditCopy = {
  ...en,
  action: 'Kitendo', actor: 'Kitambulisho cha mtendaji', all: 'Zote', apply: 'Tekeleza vichujio', category: 'Aina',
  checkedAt: 'Ilikaguliwa', emptyBody: 'Matukio yataonekana hapa baada ya shughuli za usimamizi zilizolindwa kutekelezwa.',
  emptyTitle: 'Hakuna matukio ya usalama yanayolingana', errorBody: 'Huduma iliyolindwa ya ukaguzi wa usalama haikuweza kusomwa.',
  errorTitle: 'Kumbukumbu ya usalama haipatikani', eventHash: 'Alama ya tukio',
  filterHint: 'Tumia vitambulisho kamili unapopunguza matokeo.', filters: 'Vichujio vya kumbukumbu ya usalama',
  firstInvalid: 'Mfuatano wa kwanza batili', from: 'Kuanzia', integrity: 'Uadilifu wa mnyororo',
  integrityNote: 'Kichwa cha ndani kilichothibitishwa hutambua mabadiliko ya historia mradi kichwa na ufunguo wake vinaaminika. Huu ni uthibitisho unaoonyesha uvurugaji, si hifadhi ya nje wala kinga kamili dhidi ya uvurugaji.',
  keyVersions: 'Matoleo ya ufunguo', loading: 'Inapakia kumbukumbu ya usalama iliyolindwa…', metadata: 'Metadata iliyopunguzwa',
  next: 'Ukurasa unaofuata', noActor: 'Kitendo cha mfumo au bila uthibitishaji', noMetadata: 'Hakuna metadata', outcome: 'Matokeo',
  previous: 'Ukurasa uliotangulia', requestId: 'Kitambulisho cha ombi', retry: 'Jaribu tena', sequence: 'Mfuatano',
  subject: 'Kipengee kilichoathiriwa', subjectId: 'Kitambulisho cha kipengee', subjectType: 'Aina ya kipengee', timestamp: 'Muda',
  title: 'Ukaguzi wa usalama', intro: 'Kagua matukio yaliyopunguzwa ya usimamizi yasiyobadilishwa na programu, na thibitisha uadilifu wa mnyororo wa ndani.', to: 'Hadi',
  validation: { 'invalid-time': 'Weka tarehe sahihi.', 'invalid-range': 'Tarehe ya kuanzia lazima isiwe baada ya tarehe ya mwisho.', 'invalid-identifier': 'Muundo wa mojawapo ya vitambulisho si sahihi.' },
  range: (start, end, total) => `${start}–${end} kati ya ${total}`,
  actions: swahiliActions,
  categories: { access: 'Ufikiaji', authentication: 'Uthibitishaji', authorization: 'Uidhinishaji', books: 'Vitabu', documents: 'Nyaraka', reviews: 'Mapitio' },
  outcomes: { success: 'Mafanikio', denied: 'Imekataliwa', failure: 'Imeshindwa' },
  subjects: { user: 'Mtumiaji', session: 'Kikao', invitation: 'Mwaliko', recovery: 'Urejeshaji', book_edition: 'Toleo la kitabu', document: 'Hati', review_item: 'Kipengee cha mapitio' },
  integrityStatuses: { valid: 'Halali', invalid: 'Batili', unverifiable: 'Haiwezi kuthibitishwa' },
};

export const securityAuditCopies: Record<AppLanguage, SecurityAuditCopy> = { ar, en, sw };
