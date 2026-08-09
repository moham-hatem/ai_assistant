import type { AppLanguage } from './language';
import type { FeedbackCopy } from '../features/chat/feedback/copy';

export interface AppTranslations {
  answerUnavailable: string;
  assistant: string;
  books: string;
  brandAria: string;
  changeLanguage: string;
  chatAria: string;
  disclaimer: string;
  feedback: FeedbackCopy;
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
    feedback: {
      cancel: 'إلغاء',
      close: 'إغلاق',
      commentHint: 'بحد أقصى 1000 حرف.',
      commentLabel: 'تفاصيل إضافية (اختياري)',
      commentPlaceholder: 'اكتب ما يساعدنا على فهم المشكلة…',
      confirmHelpful: 'هل تريد إرسال تقييم «مفيدة»؟',
      confirmHelpfulAction: 'نعم، إرسال',
      dialogDescription: 'اختر سببًا واحدًا على الأقل. يمكنك إضافة تفاصيل اختيارية.',
      dialogTitle: 'ما الذي لم يكن مناسبًا؟',
      error: {
        invalid_response: 'وصل رد غير مكتمل عند تسجيل التقييم. حاول مرة أخرى.',
        submission_failed: 'تعذر تسجيل تقييمك الآن. حاول مرة أخرى.',
        unavailable: 'تعذر الوصول إلى خدمة التقييم الآن. تحقق من الاتصال وحاول مرة أخرى.',
      },
      helpful: 'مفيدة',
      prompt: 'هل كانت هذه الإجابة مفيدة؟',
      reasonRequired: 'اختر سببًا واحدًا على الأقل.',
      reasons: {
        harmful_or_sensitive: 'تتضمن محتوى ضارًا أو معالجة غير مناسبة لمسألة حساسة',
        inaccurate: 'تحتوي على معلومات غير دقيقة',
        irrelevant_evidence: 'الأدلة لا ترتبط بالسؤال',
        technical_issue: 'حدثت مشكلة تقنية',
        unclear: 'الإجابة غير واضحة',
        wrong_language: 'الإجابة بلغة غير مناسبة',
      },
      retry: 'إعادة المحاولة',
      reviewRouted: 'أُحيل البلاغ إلى فريق المراجعة.',
      reviewNotCreated: 'حُفظ التقييم ولم يُحَل إلى فريق المراجعة.',
      submitReport: 'إرسال البلاغ',
      submitting: 'جارٍ الإرسال…',
      success: 'شكرًا، تم تسجيل تقييمك.',
      unhelpful: 'غير مفيدة',
    },
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
    feedback: {
      cancel: 'Cancel',
      close: 'Close',
      commentHint: 'Maximum 1,000 characters.',
      commentLabel: 'Additional details (optional)',
      commentPlaceholder: 'Tell us what went wrong…',
      confirmHelpful: 'Send a “Helpful” rating?',
      confirmHelpfulAction: 'Yes, send',
      dialogDescription: 'Select at least one reason. You can add optional details.',
      dialogTitle: 'What wasn’t right?',
      error: {
        invalid_response: 'The rating service returned an incomplete response. Try again.',
        submission_failed: 'We couldn’t record your rating right now. Try again.',
        unavailable: 'The rating service is unavailable. Check your connection and try again.',
      },
      helpful: 'Helpful',
      prompt: 'Was this answer helpful?',
      reasonRequired: 'Select at least one reason.',
      reasons: {
        harmful_or_sensitive: 'Contains harmful content or handles a sensitive issue poorly',
        inaccurate: 'Contains inaccurate information',
        irrelevant_evidence: 'The evidence is not relevant to the question',
        technical_issue: 'There was a technical issue',
        unclear: 'The answer is unclear',
        wrong_language: 'The answer is in the wrong language',
      },
      retry: 'Try again',
      reviewRouted: 'This report was sent to the review team.',
      reviewNotCreated: 'The rating was saved and was not referred for review.',
      submitReport: 'Send report',
      submitting: 'Sending…',
      success: 'Thanks, your rating was recorded.',
      unhelpful: 'Not helpful',
    },
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
    feedback: {
      cancel: 'Ghairi',
      close: 'Funga',
      commentHint: 'Upeo wa herufi 1,000.',
      commentLabel: 'Maelezo zaidi (si lazima)',
      commentPlaceholder: 'Tuambie tatizo lilikuwa nini…',
      confirmHelpful: 'Tuma tathmini ya “Lilisaidia”?',
      confirmHelpfulAction: 'Ndiyo, tuma',
      dialogDescription: 'Chagua angalau sababu moja. Unaweza kuongeza maelezo yasiyo ya lazima.',
      dialogTitle: 'Tatizo lilikuwa nini?',
      error: {
        invalid_response: 'Huduma ya tathmini imerudisha jibu lisilokamilika. Jaribu tena.',
        submission_failed: 'Hatukuweza kurekodi tathmini yako sasa. Jaribu tena.',
        unavailable: 'Huduma ya tathmini haipatikani. Angalia muunganisho wako na ujaribu tena.',
      },
      helpful: 'Lilisaidia',
      prompt: 'Je, jibu hili lilikusaidia?',
      reasonRequired: 'Chagua angalau sababu moja.',
      reasons: {
        harmful_or_sensitive: 'Lina maudhui yenye madhara au halijashughulikia suala nyeti ipasavyo',
        inaccurate: 'Lina taarifa zisizo sahihi',
        irrelevant_evidence: 'Ushahidi hauhusiani na swali',
        technical_issue: 'Kulikuwa na tatizo la kiufundi',
        unclear: 'Jibu haliko wazi',
        wrong_language: 'Jibu limeandikwa kwa lugha isiyofaa',
      },
      retry: 'Jaribu tena',
      reviewRouted: 'Taarifa hii imetumwa kwa timu ya ukaguzi.',
      reviewNotCreated: 'Tathmini imehifadhiwa na haikutumwa kwa timu ya ukaguzi.',
      submitReport: 'Tuma taarifa',
      submitting: 'Inatuma…',
      success: 'Asante, tathmini yako imerekodiwa.',
      unhelpful: 'Halikusaidia',
    },
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
