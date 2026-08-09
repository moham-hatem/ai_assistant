import type { AppLanguage } from '../../i18n/language';

export type AdminNavigationKey = 'dashboard' | 'books' | 'reviews' | 'questionLogs' | 'access' | 'settings';

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
    access: { body: string; next: string };
    books: { body: string; next: string };
    reviews: { body: string; next: string };
    questionLogs: { body: string; next: string };
    settings: { body: string; next: string };
  };
}

export const adminCopies: Record<AppLanguage, AdminCopy> = {
  ar: {
    accessNotice: 'يفرض الخادم المصادقة والتفويض لكل أداة إدارية؛ ويظل HTTPS وتجهيز التشغيل الإنتاجي مطلوبين قبل النشر العام.',
    adminLabel: 'لوحة الإدارة',
    backToAssistant: 'العودة إلى المساعد',
    changeLanguage: 'تغيير اللغة',
    currentLanguage: 'لغة الواجهة الحالية',
    dashboardIntro: 'نقطة موحدة لإدارة المحتوى ووصول الفريق ومتابعة الميزات التشغيلية المتصلة بخدمات الخادم.',
    dashboardTitle: 'نظرة عامة',
    navigation: { dashboard: 'الرئيسية', books: 'الكتب', reviews: 'المراجعات', questionLogs: 'سجل الأسئلة', access: 'وصول الفريق', settings: 'الإعدادات' },
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
    settingsAccessBody: 'إدارة وصول الفريق متاحة في صفحتها المستقلة لأصحاب صلاحية الإعدادات. يبقى الخادم مسؤولًا عن فرض المصادقة والتفويض لكل طلب.',
    settingsAccessTitle: 'الوصول والصلاحيات',
    settingsAnswerBody: 'محرك الإجابة وإعداداته لم تتغير ضمن هذا العمل.',
    settingsAnswerTitle: 'محرك الإجابة',
    status: 'الحالة',
    featureCards: {
      access: { body: 'إنشاء دعوات آمنة وإدارة أدوار حسابات الفريق وحالتها وجلساتها وروابط الاستعادة.', next: 'يظل الخادم صاحب القرار النهائي، ولا يمنح دور مسؤول الإعدادات اعتماد المحتوى.' },
      books: { body: 'تعرض الصفحة الكتب وإصداراتها وتنفذ انتقالات الحالة التي تسمح بها عقود الخادم.', next: 'ربط الرفع بدورة الإصدارات في مهمة مستقلة بعد تحديد سير الاستيراد.' },
      reviews: { body: 'تعرض الصفحة طابور الخادم الحقيقي وتدعم الاستلام والإفلات والقرارات النهائية مع سجل الأحداث.', next: 'تُستخدم هوية حساب الفريق الموثقة كمعرّف للمراجع مع بقاء التحقق النهائي في الخادم.' },
      questionLogs: { body: 'تعرض الصفحة سجل الأسئلة الحقيقي مع التصفح وتفاصيل النتيجة والأدلة.', next: 'توسيع الفلاتر وسياسات الخصوصية والاحتفاظ قبل النشر العام.' },
      settings: { body: 'تعرض الصفحة إعدادات الواجهة الحالية، بينما توجد إدارة وصول الفريق في صفحة مستقلة.', next: 'تحديد إعدادات المنصة الإضافية وعقد حفظها في الخادم.' },
    },
  },
  en: {
    accessNotice: 'The server enforces authentication and authorization for every admin tool; HTTPS and production hardening are still required before public release.',
    adminLabel: 'Administration',
    backToAssistant: 'Back to assistant',
    changeLanguage: 'Change language',
    currentLanguage: 'Current interface language',
    dashboardIntro: 'One place to manage content and team access and monitor operational features backed by server services.',
    dashboardTitle: 'Overview',
    navigation: { dashboard: 'Dashboard', books: 'Books', reviews: 'Reviews', questionLogs: 'Question logs', access: 'Team access', settings: 'Settings' },
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
    settingsAccessBody: 'Team access is available on its own page to accounts with settings permission. The server remains responsible for authenticating and authorizing every request.',
    settingsAccessTitle: 'Access and roles',
    settingsAnswerBody: 'The answer engine and its configuration were not changed by this work.',
    settingsAnswerTitle: 'Answer engine',
    status: 'Status',
    featureCards: {
      access: { body: 'Create secure invitations and manage team-account roles, status, sessions, and recovery links.', next: 'The server stays authoritative, and the settings-admin role does not grant content approval.' },
      books: { body: 'The page shows books and editions and runs only lifecycle transitions permitted by server contracts.', next: 'Connect uploads to editions in a separate task after defining the import workflow.' },
      reviews: { body: 'The page uses the real server queue and supports assignment, final decisions, and ordered audit history.', next: 'The trusted team principal is now used as the reviewer ID; the server remains the final authorization boundary.' },
      questionLogs: { body: 'The page reads the real question log with pagination, outcome details, and evidence.', next: 'Extend filters, privacy, and retention policies before public release.' },
      settings: { body: 'This page shows current interface settings, while team access has its own management page.', next: 'Define additional platform settings and their server persistence contract.' },
    },
  },
  sw: {
    accessNotice: 'Seva inatekeleza uthibitishaji na ruhusa kwa kila zana ya usimamizi; HTTPS na maandalizi ya uzalishaji bado yanahitajika kabla ya kutolewa kwa umma.',
    adminLabel: 'Usimamizi',
    backToAssistant: 'Rudi kwa msaidizi',
    changeLanguage: 'Badilisha lugha',
    currentLanguage: 'Lugha ya sasa ya kiolesura',
    dashboardIntro: 'Sehemu moja ya kusimamia maudhui na ufikiaji wa timu na kufuatilia vipengele vinavyounganishwa na huduma za seva.',
    dashboardTitle: 'Muhtasari',
    navigation: { dashboard: 'Dashibodi', books: 'Vitabu', reviews: 'Mapitio', questionLogs: 'Kumbukumbu za maswali', access: 'Ufikiaji wa timu', settings: 'Mipangilio' },
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
    settingsAccessBody: 'Ufikiaji wa timu una ukurasa wake kwa akaunti zenye ruhusa ya mipangilio. Seva bado lazima ithibitishe kila ombi.',
    settingsAccessTitle: 'Ufikiaji na majukumu',
    settingsAnswerBody: 'Injini ya majibu na mipangilio yake haikubadilishwa katika kazi hii.',
    settingsAnswerTitle: 'Injini ya majibu',
    status: 'Hali',
    featureCards: {
      access: { body: 'Unda mialiko salama na usimamie majukumu, hali, vikao, na viungo vya urejeshaji vya akaunti za timu.', next: 'Seva ndiyo yenye uamuzi wa mwisho, na jukumu la msimamizi wa mipangilio haliruhusu kuidhinisha maudhui.' },
      books: { body: 'Ukurasa unaonyesha vitabu na matoleo na kutekeleza mabadiliko yanayoruhusiwa na mikataba ya seva pekee.', next: 'Unganisha upakiaji na matoleo katika kazi tofauti baada ya kufafanua mtiririko wa uingizaji.' },
      reviews: { body: 'Ukurasa unatumia foleni halisi ya seva na una usimamizi wa kazi, maamuzi, na historia iliyopangwa.', next: 'Utambulisho wa akaunti ya timu unatumika kama kitambulisho cha mkaguzi; seva ndiyo mpaka wa mwisho wa ruhusa.' },
      questionLogs: { body: 'Ukurasa unasoma kumbukumbu halisi kwa kurasa pamoja na matokeo na ushahidi.', next: 'Panua vichujio na sera za faragha na uhifadhi kabla ya kutolewa kwa umma.' },
      settings: { body: 'Ukurasa unaonyesha mipangilio ya kiolesura, na ufikiaji wa timu una ukurasa wake.', next: 'Bainisha mipangilio mingine ya jukwaa na mkataba wake wa kuhifadhi kwenye seva.' },
    },
  },
};
