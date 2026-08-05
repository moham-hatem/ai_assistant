import type { AppLanguage } from './language';

export interface AppTranslations {
  answerUnavailable: string;
  assistant: string;
  books: string;
  brandAria: string;
  changeLanguage: string;
  chatAria: string;
  disclaimer: string;
  heroBody: string;
  heroEyebrow: string;
  heroTitle: string;
  incompleteResponse: string;
  localContent: string;
  placeholder: string;
  questionLabel: string;
  searching: string;
  selectLanguageBody: string;
  selectLanguageTitle: string;
  send: string;
  serviceUnavailable: string;
  unexpectedError: string;
  welcome: string;
}

export const translations: Record<AppLanguage, AppTranslations> = {
  ar: {
    answerUnavailable: 'تعذر إنشاء الإجابة الآن.',
    assistant: 'المساعد',
    books: 'الكتب',
    brandAria: 'دليل',
    changeLanguage: 'تغيير اللغة',
    chatAria: 'المحادثة التعليمية',
    disclaimer: 'للتعلّم العام فقط، وليس بديلًا عن سؤال معلم أو مختص في المسائل الشخصية والفتاوى.',
    heroBody: 'المساعد يجيب من الكتب المضافة محليًا، ويعتذر بوضوح عندما لا يجد دليلًا كافيًا.',
    heroEyebrow: 'مساعد تعليمي إسلامي',
    heroTitle: 'اسأل عن الإسلام من المنهج المعتمد',
    incompleteResponse: 'وصل رد غير مكتمل من خدمة الإجابة.',
    localContent: 'محتوى محلي معتمد',
    placeholder: 'اكتب سؤالك هنا…',
    questionLabel: 'اكتب سؤالك',
    searching: 'أبحث في المحتوى المعتمد…',
    selectLanguageBody: 'سنستخدم هذه اللغة في الواجهة وفي إجابات المساعد. يمكنك تغييرها لاحقًا.',
    selectLanguageTitle: 'اختر لغتك',
    send: 'إرسال السؤال',
    serviceUnavailable: 'تعذر الوصول إلى خدمة الإجابة الآن. حاول مرة أخرى لاحقًا.',
    unexpectedError: 'حدث خطأ غير متوقع أثناء إرسال السؤال.',
    welcome: 'مرحبًا بك. اكتب سؤالك، وسأجيب من الكتب التعليمية الموجودة محليًا داخل المشروع.',
  },
  en: {
    answerUnavailable: 'The answer could not be generated right now.',
    assistant: 'Assistant',
    books: 'Books',
    brandAria: 'Daleel',
    changeLanguage: 'Change language',
    chatAria: 'Educational conversation',
    disclaimer: 'For general learning only. It is not a substitute for asking a qualified teacher about personal matters or religious rulings.',
    heroBody: 'The assistant answers from locally added books and clearly says when the available evidence is insufficient.',
    heroEyebrow: 'Islamic learning assistant',
    heroTitle: 'Learn Islam from the approved curriculum',
    incompleteResponse: 'The answer service returned an incomplete response.',
    localContent: 'Approved local content',
    placeholder: 'Type your question here…',
    questionLabel: 'Type your question',
    searching: 'Searching the approved content…',
    selectLanguageBody: 'We will use this language for the interface and the assistant’s answers. You can change it later.',
    selectLanguageTitle: 'Choose your language',
    send: 'Send question',
    serviceUnavailable: 'The answer service is unavailable right now. Please try again later.',
    unexpectedError: 'An unexpected error occurred while sending your question.',
    welcome: 'Welcome. Ask a question and I will answer from the educational books stored locally in this project.',
  },
  sw: {
    answerUnavailable: 'Jibu haliwezi kutayarishwa sasa hivi.',
    assistant: 'Msaidizi',
    books: 'Vitabu',
    brandAria: 'Daleel',
    changeLanguage: 'Badilisha lugha',
    chatAria: 'Mazungumzo ya elimu',
    disclaimer: 'Kwa kujifunza kwa ujumla tu. Hauchukui nafasi ya kumuuliza mwalimu mwenye ujuzi kuhusu masuala binafsi au fatwa.',
    heroBody: 'Msaidizi hujibu kutokana na vitabu vilivyoongezwa kwenye kifaa na husema wazi ikiwa ushahidi hautoshi.',
    heroEyebrow: 'Msaidizi wa elimu ya Kiislamu',
    heroTitle: 'Jifunze Uislamu kutoka kwenye mtaala ulioidhinishwa',
    incompleteResponse: 'Huduma ya majibu imerudisha jibu lisilokamilika.',
    localContent: 'Maudhui ya ndani yaliyoidhinishwa',
    placeholder: 'Andika swali lako hapa…',
    questionLabel: 'Andika swali lako',
    searching: 'Ninatafuta kwenye maudhui yaliyoidhinishwa…',
    selectLanguageBody: 'Tutatumia lugha hii kwenye mwonekano na majibu ya msaidizi. Unaweza kuibadilisha baadaye.',
    selectLanguageTitle: 'Chagua lugha yako',
    send: 'Tuma swali',
    serviceUnavailable: 'Huduma ya majibu haipatikani sasa. Tafadhali jaribu tena baadaye.',
    unexpectedError: 'Hitilafu isiyotarajiwa imetokea wakati wa kutuma swali.',
    welcome: 'Karibu. Uliza swali nami nitajibu kutokana na vitabu vya elimu vilivyohifadhiwa kwenye mradi huu.',
  },
};
