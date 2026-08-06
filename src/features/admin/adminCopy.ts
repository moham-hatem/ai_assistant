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
  placeholder: {
    reviews: { current: string; next: string; points: string[] };
    questionLogs: { current: string; next: string; points: string[] };
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
      books: 'رفع الكتب المعتمدة ومعاينتها وحذفها من قاعدة المعرفة الحالية.',
      reviews: 'مساحة مخططة لمراجعة الإجابات التي تحتاج إلى تدخل معلم.',
      questionLogs: 'مساحة مخططة لمتابعة الأسئلة والنتائج مع مراعاة الخصوصية.',
      settings: 'حالة الإعدادات الإدارية وحدود ما يمكن تغييره حاليًا.',
    },
    pageTitle: { books: 'إدارة الكتب', reviews: 'مراجعة الإجابات', questionLogs: 'سجل الأسئلة', settings: 'الإعدادات' },
    planned: 'مخطط',
    ready: 'متاح الآن',
    settingsAccessBody: 'لا توجد مصادقة إدارية في الواجهة الحالية. المسارات المخفية ليست حدًا أمنيًا.',
    settingsAccessTitle: 'الوصول والصلاحيات',
    settingsAnswerBody: 'محرك الإجابة وإعداداته لم تتغير ضمن هذا العمل.',
    settingsAnswerTitle: 'محرك الإجابة',
    status: 'الحالة',
    featureCards: {
      books: { body: 'الرفع والقائمة والمعاينة والحذف تعمل عبر خدمات المستندات الحالية.', next: 'تحقق من صلاحيات إدارة المستندات عند إضافة مصادقة الخادم.' },
      reviews: { body: 'لا توجد قائمة مراجعة أو قرارات اعتماد محفوظة بعد.', next: 'تعريف نموذج المراجعة ونقاط API وأدوار المعلمين.' },
      questionLogs: { body: 'لا يتم جلب أو عرض سجل أسئلة في هذه الصفحة بعد.', next: 'تعريف سياسة الاحتفاظ والخصوصية ثم إنشاء API مخصص.' },
      settings: { body: 'تعرض الصفحة الحدود الحالية فقط دون حفظ إعدادات جديدة.', next: 'تحديد الإعدادات المسموح بها وعقد الحفظ في الخادم.' },
    },
    placeholder: {
      reviews: {
        current: 'الواجهة جاهزة لاستقبال قائمة مراجعة، لكن لا يوجد مصدر بيانات أو إجراء اعتماد حاليًا.',
        next: 'ربط قائمة انتظار من الخادم بعد تعريف حالات المراجعة والصلاحيات.',
        points: ['تصفية الإجابات التي تحتاج مراجعة', 'إظهار السؤال والأدلة والإجابة معًا', 'تسجيل قرار المعلم وملاحظاته'],
      },
      questionLogs: {
        current: 'لا تسجل هذه الواجهة أسئلة المستخدمين ولا تعرض بيانات تجريبية توحي بوجود سجل حقيقي.',
        next: 'إقرار سياسة الخصوصية والاحتفاظ قبل بناء القراءة والتصفية والتصدير.',
        points: ['بحث وتصفية بالتاريخ والحالة', 'إخفاء أو حذف البيانات الحساسة', 'تتبّع النتيجة دون تغيير محرك الإجابة'],
      },
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
      books: 'Upload, preview, and remove approved books from the current knowledge base.',
      reviews: 'A planned workspace for answers that need a teacher review.',
      questionLogs: 'A planned view of questions and outcomes with privacy in mind.',
      settings: 'The current state and boundaries of administrative settings.',
    },
    pageTitle: { books: 'Book management', reviews: 'Answer reviews', questionLogs: 'Question logs', settings: 'Settings' },
    planned: 'Planned',
    ready: 'Available now',
    settingsAccessBody: 'There is no admin authentication yet. Obscured routes are not a security boundary.',
    settingsAccessTitle: 'Access and roles',
    settingsAnswerBody: 'The answer engine and its configuration were not changed by this work.',
    settingsAnswerTitle: 'Answer engine',
    status: 'Status',
    featureCards: {
      books: { body: 'Upload, list, preview, and delete use the existing document services.', next: 'Enforce document-management roles when server authentication is added.' },
      reviews: { body: 'There is no review queue or persisted approval decision yet.', next: 'Define the review model, API endpoints, and teacher roles.' },
      questionLogs: { body: 'This page does not fetch or display question history yet.', next: 'Set retention and privacy rules, then add a dedicated API.' },
      settings: { body: 'This page documents current boundaries without persisting new settings.', next: 'Choose editable settings and define a server persistence contract.' },
    },
    placeholder: {
      reviews: {
        current: 'The UI is ready to host a review queue, but there is no data source or approval action yet.',
        next: 'Connect a server queue after review states and permissions are defined.',
        points: ['Filter answers that need review', 'Show question, evidence, and answer together', 'Record the teacher decision and notes'],
      },
      questionLogs: {
        current: 'The UI does not record user questions or show sample data that could be mistaken for real history.',
        next: 'Approve privacy and retention rules before adding read, filter, and export capabilities.',
        points: ['Search and filter by date and status', 'Redact or delete sensitive data', 'Track outcomes without changing the answer engine'],
      },
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
      books: 'Pakia, hakiki, na uondoe vitabu vilivyoidhinishwa kwenye hazina ya maarifa.',
      reviews: 'Sehemu iliyopangwa kwa majibu yanayohitaji mapitio ya mwalimu.',
      questionLogs: 'Mwonekano uliopangwa wa maswali na matokeo unaozingatia faragha.',
      settings: 'Hali na mipaka ya sasa ya mipangilio ya usimamizi.',
    },
    pageTitle: { books: 'Usimamizi wa vitabu', reviews: 'Mapitio ya majibu', questionLogs: 'Kumbukumbu za maswali', settings: 'Mipangilio' },
    planned: 'Imepangwa',
    ready: 'Inapatikana sasa',
    settingsAccessBody: 'Bado hakuna uthibitishaji wa msimamizi. Njia zilizofichwa si mpaka wa usalama.',
    settingsAccessTitle: 'Ufikiaji na majukumu',
    settingsAnswerBody: 'Injini ya majibu na mipangilio yake haikubadilishwa katika kazi hii.',
    settingsAnswerTitle: 'Injini ya majibu',
    status: 'Hali',
    featureCards: {
      books: { body: 'Kupakia, orodha, hakiki, na kufuta hutumia huduma zilizopo za nyaraka.', next: 'Tekeleza ruhusa za nyaraka wakati uthibitishaji wa seva utaongezwa.' },
      reviews: { body: 'Bado hakuna foleni ya mapitio wala maamuzi yaliyohifadhiwa.', next: 'Fafanua muundo wa mapitio, API, na majukumu ya walimu.' },
      questionLogs: { body: 'Ukurasa huu bado hauleti wala kuonyesha historia ya maswali.', next: 'Weka sera za faragha na uhifadhi, kisha ongeza API.' },
      settings: { body: 'Ukurasa unaonyesha mipaka ya sasa bila kuhifadhi mipangilio mipya.', next: 'Chagua mipangilio inayoweza kubadilishwa na mkataba wa seva.' },
    },
    placeholder: {
      reviews: {
        current: 'Kiolesura kiko tayari kwa foleni, lakini bado hakuna chanzo cha data au kitendo cha kuidhinisha.',
        next: 'Unganisha foleni ya seva baada ya kufafanua hali na ruhusa.',
        points: ['Chuja majibu yanayohitaji mapitio', 'Onyesha swali, ushahidi, na jibu pamoja', 'Hifadhi uamuzi na maelezo ya mwalimu'],
      },
      questionLogs: {
        current: 'Kiolesura hakirekodi maswali wala kuonyesha data ya mfano kama historia halisi.',
        next: 'Idhinisha sera za faragha na uhifadhi kabla ya kuongeza usomaji na usafirishaji.',
        points: ['Tafuta kwa tarehe na hali', 'Ficha au futa data nyeti', 'Fuatilia matokeo bila kubadilisha injini ya majibu'],
      },
    },
  },
};
