import type { AppLanguage } from '../../../i18n/language';
import type {
  EvidenceSufficiency,
  QuestionLogChannel,
  QuestionLogStatus,
} from '../../../../shared/contracts/question-log';

export interface QuestionLogsCopy {
  answer: string;
  apology: string;
  channel: string;
  channels: Record<QuestionLogChannel, string>;
  chooseRecordBody: string;
  chooseRecordTitle: string;
  closeDetails: string;
  completedAt: string;
  details: string;
  emptyBody: string;
  emptyTitle: string;
  evidence: string;
  grounded: string;
  language: string;
  latency: string;
  listLabel: string;
  loadDetailsError: string;
  loadListError: string;
  loadingDetails: string;
  loadingList: string;
  metadata: string;
  model: string;
  nextPage: string;
  no: string;
  noEvidence: string;
  notAvailable: string;
  previousPage: string;
  provider: string;
  question: string;
  refresh: string;
  result: string;
  retry: string;
  startedAt: string;
  status: string;
  statuses: Record<QuestionLogStatus, string>;
  sufficiencies: Record<EvidenceSufficiency, string>;
  sufficiency: string;
  time: string;
  unknown: string;
  yes: string;
  rangeLabel: (start: number, end: number, total: number) => string;
  recordCount: (count: number) => string;
  viewDetails: (question: string) => string;
}

export const questionLogsCopies: Record<AppLanguage, QuestionLogsCopy> = {
  ar: {
    answer: 'الإجابة',
    apology: 'الاعتذار',
    channel: 'القناة',
    channels: { telegram: 'تيليجرام', web: 'الويب' },
    chooseRecordBody: 'اختر سؤالًا من القائمة لعرض النتيجة والأدلة وبيانات التنفيذ.',
    chooseRecordTitle: 'اختر سجلًا',
    closeDetails: 'إغلاق التفاصيل',
    completedAt: 'وقت الاكتمال',
    details: 'تفاصيل السجل',
    emptyBody: 'ستظهر هنا الأسئلة بعد معالجتها وحفظها في سجل الخادم المحلي.',
    emptyTitle: 'لا توجد أسئلة مسجلة',
    evidence: 'مراجع الأدلة',
    grounded: 'مستند إلى الأدلة',
    language: 'لغة الإجابة',
    latency: 'زمن الاستجابة',
    listLabel: 'قائمة سجلات الأسئلة',
    loadDetailsError: 'تعذر تحميل تفاصيل هذا السجل.',
    loadListError: 'تعذر تحميل سجل الأسئلة من الخادم.',
    loadingDetails: 'جارٍ تحميل تفاصيل السجل…',
    loadingList: 'جارٍ تحميل سجل الأسئلة…',
    metadata: 'بيانات التنفيذ',
    model: 'النموذج',
    nextPage: 'الصفحة التالية',
    no: 'لا',
    noEvidence: 'لا توجد مراجع أدلة محفوظة لهذا السجل.',
    notAvailable: 'غير متاح',
    previousPage: 'الصفحة السابقة',
    provider: 'المزوّد',
    question: 'السؤال',
    refresh: 'تحديث',
    result: 'النتيجة',
    retry: 'إعادة المحاولة',
    startedAt: 'وقت البدء',
    status: 'الحالة',
    statuses: { answered: 'تمت الإجابة', declined: 'اعتذار', failed: 'فشل' },
    sufficiencies: { sufficient: 'كافٍ', insufficient: 'غير كافٍ', unknown: 'غير معروف' },
    sufficiency: 'كفاية الأدلة',
    time: 'الوقت',
    unknown: 'غير معروف',
    yes: 'نعم',
    rangeLabel: (start, end, total) => `${start.toLocaleString('ar-EG')}–${end.toLocaleString('ar-EG')} من ${total.toLocaleString('ar-EG')}`,
    recordCount: (count) => `${count.toLocaleString('ar-EG')} سجل`,
    viewDetails: (question) => `عرض تفاصيل السؤال: ${question}`,
  },
  en: {
    answer: 'Answer',
    apology: 'Apology',
    channel: 'Channel',
    channels: { telegram: 'Telegram', web: 'Web' },
    chooseRecordBody: 'Select a question from the list to inspect its outcome, evidence, and execution data.',
    chooseRecordTitle: 'Select a record',
    closeDetails: 'Close details',
    completedAt: 'Completed',
    details: 'Record details',
    emptyBody: 'Questions will appear here after they are processed and saved in the local server log.',
    emptyTitle: 'No questions recorded',
    evidence: 'Evidence references',
    grounded: 'Grounded',
    language: 'Answer language',
    latency: 'Latency',
    listLabel: 'Question log records',
    loadDetailsError: 'The details for this record could not be loaded.',
    loadListError: 'The question log could not be loaded from the server.',
    loadingDetails: 'Loading record details…',
    loadingList: 'Loading question logs…',
    metadata: 'Execution metadata',
    model: 'Model',
    nextPage: 'Next page',
    no: 'No',
    noEvidence: 'No evidence references were stored for this record.',
    notAvailable: 'Not available',
    previousPage: 'Previous page',
    provider: 'Provider',
    question: 'Question',
    refresh: 'Refresh',
    result: 'Outcome',
    retry: 'Try again',
    startedAt: 'Started',
    status: 'Status',
    statuses: { answered: 'Answered', declined: 'Declined', failed: 'Failed' },
    sufficiencies: { sufficient: 'Sufficient', insufficient: 'Insufficient', unknown: 'Unknown' },
    sufficiency: 'Evidence sufficiency',
    time: 'Time',
    unknown: 'Unknown',
    yes: 'Yes',
    rangeLabel: (start, end, total) => `${start}–${end} of ${total}`,
    recordCount: (count) => `${count} ${count === 1 ? 'record' : 'records'}`,
    viewDetails: (question) => `View details for: ${question}`,
  },
  sw: {
    answer: 'Jibu',
    apology: 'Samahani',
    channel: 'Kituo',
    channels: { telegram: 'Telegram', web: 'Wavuti' },
    chooseRecordBody: 'Chagua swali kwenye orodha ili kuona matokeo, ushahidi, na data ya utekelezaji.',
    chooseRecordTitle: 'Chagua kumbukumbu',
    closeDetails: 'Funga maelezo',
    completedAt: 'Ilikamilika',
    details: 'Maelezo ya kumbukumbu',
    emptyBody: 'Maswali yataonekana hapa baada ya kushughulikiwa na kuhifadhiwa kwenye kumbukumbu ya seva ya ndani.',
    emptyTitle: 'Hakuna maswali yaliyohifadhiwa',
    evidence: 'Marejeleo ya ushahidi',
    grounded: 'Imethibitishwa kwa ushahidi',
    language: 'Lugha ya jibu',
    latency: 'Muda wa kujibu',
    listLabel: 'Orodha ya kumbukumbu za maswali',
    loadDetailsError: 'Maelezo ya kumbukumbu hii hayakuweza kupakiwa.',
    loadListError: 'Kumbukumbu za maswali hazikuweza kupakiwa kutoka kwenye seva.',
    loadingDetails: 'Inapakia maelezo ya kumbukumbu…',
    loadingList: 'Inapakia kumbukumbu za maswali…',
    metadata: 'Data ya utekelezaji',
    model: 'Muundo',
    nextPage: 'Ukurasa unaofuata',
    no: 'Hapana',
    noEvidence: 'Hakuna marejeleo ya ushahidi yaliyohifadhiwa kwa kumbukumbu hii.',
    notAvailable: 'Haipatikani',
    previousPage: 'Ukurasa uliotangulia',
    provider: 'Mtoa huduma',
    question: 'Swali',
    refresh: 'Onyesha upya',
    result: 'Matokeo',
    retry: 'Jaribu tena',
    startedAt: 'Ilianza',
    status: 'Hali',
    statuses: { answered: 'Limejibiwa', declined: 'Limekataliwa', failed: 'Imeshindwa' },
    sufficiencies: { sufficient: 'Unatosha', insufficient: 'Hautoshi', unknown: 'Haijulikani' },
    sufficiency: 'Utoshelevu wa ushahidi',
    time: 'Muda',
    unknown: 'Haijulikani',
    yes: 'Ndiyo',
    rangeLabel: (start, end, total) => `${start}–${end} kati ya ${total}`,
    recordCount: (count) => `Kumbukumbu ${count}`,
    viewDetails: (question) => `Tazama maelezo ya swali: ${question}`,
  },
};
