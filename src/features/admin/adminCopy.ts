import type { AppLanguage } from '../../i18n/language';

export type AdminNavigationKey = 'dashboard' | 'books' | 'reviews' | 'questionLogs' | 'settings';

export interface AdminCopy {
  accessNotice: string;
  adminLabel: string;
  backToAssistant: string;
  changeLanguage: string;
  currentLanguage: string;
  dashboardIntro: string;
  dashboardTitle: string;
  navigation: Record<AdminNavigationKey, string>;
  nextStep: string;
  pageIntro: Record<'books' | 'reviews' | 'questionLogs' | 'settings', string>;
  pageTitle: Record<'books' | 'reviews' | 'questionLogs' | 'settings', string>;
  planned: string;
  ready: string;
  settingsAccessBody: string;
  settingsAccessTitle: string;
  settingsAnswerBody: string;
  settingsAnswerTitle: string;
  status: string;
  featureCards: {
    books: { body: string; next: string };
    reviews: { body: string; next: string };
    questionLogs: { body: string; next: string };
    settings: { body: string; next: string };
  };
}

export const adminCopies: Record<AppLanguage, AdminCopy> = {
  ar: {
    accessNotice: 'هذه واجهة داخلية فقط. إخفاء رابطها لا يُعد حماية؛ يجب فرض صلاحيات الإدارة عبر مصادقة وتفويض في الخادم قبل النشر.',
    adminLabel: 'لوحة الإدارة',
    backToAssistant: 'العودة إلى المساعد',
    changeLanguage: 'تغيير اللغة',
    currentLanguage: 'لغة الواجهة الحالية',
    dashboardIntro: 'نقطة موحدة لإدارة المحتوى ومتابعة الميزات التشغيلية قبل ربطها بخدمات الخادم.',
    dashboardTitle: 'نظرة عامة',
    navigation: { dashboard: 'الرئيسية', books: 'الكتب', reviews: 'المراجعات', questionLogs: 'سجل الأسئلة', settings: 'الإعدادات' },
    nextStep: 'الخطوة التالية',
    pageIntro: {
      books: 'إدارة سجلات الكتب وإصداراتها ودورة نشرها، مع إبقاء أدوات الملفات القديمة منفصلة أثناء الانتقال.',
      reviews: 'طابور فعلي لمراجعة إجابات المعلمين واستلامها واعتمادها أو تصحيحها مع سجل تدقيق كامل.',
      questionLogs: 'متابعة الأسئلة المسجلة ونتائجها وأدلتها وبيانات تنفيذها من سجل الخادم الحقيقي.',
      settings: 'حالة الإعدادات الإدارية وحدود ما يمكن تغييره حاليًا.',
    },
    pageTitle: { books: 'إدارة الكتب', reviews: 'مراجعة الإجابات', questionLogs: 'سجل الأسئلة', settings: 'الإعدادات' },
    planned: 'مخطط',
    ready: 'متاح الآن',
    settingsAccessBody: 'تعرض الواجهة الأدوات حسب صلاحيات حساب الفريق. يبقى الخادم مسؤولًا عن فرض المصادقة والتفويض لكل طلب.',
    settingsAccessTitle: 'الوصول والصلاحيات',
    settingsAnswerBody: 'محرك الإجابة وإعداداته لم تتغير ضمن هذا العمل.',
    settingsAnswerTitle: 'محرك الإجابة',
    status: 'الحالة',
    featureCards: {
      books: { body: 'تعرض الصفحة الكتب وإصداراتها وتنفذ انتقالات الحالة التي تسمح بها عقود الخادم.', next: 'ربط الرفع بدورة الإصدارات في مهمة مستقلة بعد تحديد سير الاستيراد.' },
      reviews: { body: 'تعرض الصفحة طابور الخادم الحقيقي وتدعم الاستلام والإفلات والقرارات النهائية مع سجل الأحداث.', next: 'تُستخدم هوية حساب الفريق الموثقة كمعرّف للمراجع مع بقاء التحقق النهائي في الخادم.' },
      questionLogs: { body: 'تعرض الصفحة سجل الأسئلة الحقيقي مع التصفح وتفاصيل النتيجة والأدلة.', next: 'إضافة مصادقة وصلاحيات إدارية في الخادم قبل النشر.' },
      settings: { body: 'تعرض الصفحة الحدود الحالية فقط دون حفظ إعدادات جديدة.', next: 'تحديد الإعدادات المسموح بها وعقد الحفظ في الخادم.' },
    },
  },
  en: {
    accessNotice: 'This is an internal UI only. Hiding its link is not protection; server-side authentication and authorization must be enforced before release.',
    adminLabel: 'Administration',
    backToAssistant: 'Back to assistant',
    changeLanguage: 'Change language',
    currentLanguage: 'Current interface language',
    dashboardIntro: 'One place to manage content and track operational features before their server services are connected.',
    dashboardTitle: 'Overview',
    navigation: { dashboard: 'Dashboard', books: 'Books', reviews: 'Reviews', questionLogs: 'Question logs', settings: 'Settings' },
    nextStep: 'Next step',
    pageIntro: {
      books: 'Manage book records, editions, and publication lifecycle while legacy file tools remain separate during migration.',
      reviews: 'A live teacher-review queue for claiming, approving, correcting, rejecting, and auditing answers.',
      questionLogs: 'Inspect recorded questions, outcomes, evidence, and execution metadata from the real server log.',
      settings: 'The current state and boundaries of administrative settings.',
    },
    pageTitle: { books: 'Book management', reviews: 'Answer reviews', questionLogs: 'Question logs', settings: 'Settings' },
    planned: 'Planned',
    ready: 'Available now',
    settingsAccessBody: 'The UI exposes tools according to team-account permissions. The server remains responsible for authenticating and authorizing every request.',
    settingsAccessTitle: 'Access and roles',
    settingsAnswerBody: 'The answer engine and its configuration were not changed by this work.',
    settingsAnswerTitle: 'Answer engine',
    status: 'Status',
    featureCards: {
      books: { body: 'The page shows books and editions and runs only lifecycle transitions permitted by server contracts.', next: 'Connect uploads to editions in a separate task after defining the import workflow.' },
      reviews: { body: 'The page uses the real server queue and supports assignment, final decisions, and ordered audit history.', next: 'The trusted team principal is now used as the reviewer ID; the server remains the final authorization boundary.' },
      questionLogs: { body: 'The page reads the real question log with pagination, outcome details, and evidence.', next: 'Add server-side admin authentication and authorization before release.' },
      settings: { body: 'This page documents current boundaries without persisting new settings.', next: 'Choose editable settings and define a server persistence contract.' },
    },
  },
  sw: {
    accessNotice: 'Hiki ni kiolesura cha ndani tu. Kuficha kiungo si ulinzi; uthibitishaji na ruhusa za seva lazima zitekelezwe kabla ya kutolewa.',
    adminLabel: 'Usimamizi',
    backToAssistant: 'Rudi kwa msaidizi',
    changeLanguage: 'Badilisha lugha',
    currentLanguage: 'Lugha ya sasa ya kiolesura',
    dashboardIntro: 'Sehemu moja ya kusimamia maudhui na kufuatilia vipengele kabla ya kuunganisha huduma za seva.',
    dashboardTitle: 'Muhtasari',
    navigation: { dashboard: 'Dashibodi', books: 'Vitabu', reviews: 'Mapitio', questionLogs: 'Kumbukumbu za maswali', settings: 'Mipangilio' },
    nextStep: 'Hatua inayofuata',
    pageIntro: {
      books: 'Simamia rekodi za vitabu, matoleo, na mzunguko wa uchapishaji huku zana za faili za zamani zikiwa tofauti.',
      reviews: 'Foleni halisi ya walimu ya kuchukua, kuidhinisha, kusahihisha, kukataa, na kukagua majibu.',
      questionLogs: 'Kagua maswali, matokeo, ushahidi, na data ya utekelezaji kutoka kwenye kumbukumbu halisi ya seva.',
      settings: 'Hali na mipaka ya sasa ya mipangilio ya usimamizi.',
    },
    pageTitle: { books: 'Usimamizi wa vitabu', reviews: 'Mapitio ya majibu', questionLogs: 'Kumbukumbu za maswali', settings: 'Mipangilio' },
    planned: 'Imepangwa',
    ready: 'Inapatikana sasa',
    settingsAccessBody: 'Kiolesura kinaonyesha zana kulingana na ruhusa za akaunti ya timu. Seva bado lazima ithibitishe kila ombi.',
    settingsAccessTitle: 'Ufikiaji na majukumu',
    settingsAnswerBody: 'Injini ya majibu na mipangilio yake haikubadilishwa katika kazi hii.',
    settingsAnswerTitle: 'Injini ya majibu',
    status: 'Hali',
    featureCards: {
      books: { body: 'Ukurasa unaonyesha vitabu na matoleo na kutekeleza mabadiliko yanayoruhusiwa na mikataba ya seva pekee.', next: 'Unganisha upakiaji na matoleo katika kazi tofauti baada ya kufafanua mtiririko wa uingizaji.' },
      reviews: { body: 'Ukurasa unatumia foleni halisi ya seva na una usimamizi wa kazi, maamuzi, na historia iliyopangwa.', next: 'Utambulisho wa akaunti ya timu unatumika kama kitambulisho cha mkaguzi; seva ndiyo mpaka wa mwisho wa ruhusa.' },
      questionLogs: { body: 'Ukurasa unasoma kumbukumbu halisi kwa kurasa pamoja na matokeo na ushahidi.', next: 'Ongeza uthibitishaji na ruhusa za msimamizi kwenye seva kabla ya kutolewa.' },
      settings: { body: 'Ukurasa unaonyesha mipaka ya sasa bila kuhifadhi mipangilio mipya.', next: 'Chagua mipangilio inayoweza kubadilishwa na mkataba wa seva.' },
    },
  },
};
