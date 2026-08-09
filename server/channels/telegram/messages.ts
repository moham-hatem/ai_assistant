import type { AnswerLanguage } from '../../domain.ts';

export const languageKeyboard = {
  inline_keyboard: [[
    { callback_data: 'language:ar', text: 'العربية' },
    { callback_data: 'language:en', text: 'English' },
    { callback_data: 'language:sw', text: 'Kiswahili' },
  ]],
};

const copy = {
  ar: {
    chooseLanguage: 'اختر لغة الإجابة:',
    error: 'تعذر إكمال الطلب الآن. حاول مرة أخرى لاحقًا.',
    languageChanged: 'تم اختيار العربية.',
    questionTooLong: 'السؤال طويل جدًا. الحد الأقصى 2000 حرف.',
    rateLimited: 'وصلت إلى الحد المؤقت للأسئلة. حاول مرة أخرى بعد قليل.',
    welcome: 'مرحبًا بك في المساعد التعليمي الإسلامي. أرسل سؤالك بعد اختيار اللغة.',
  },
  en: {
    chooseLanguage: 'Choose the answer language:',
    error: 'The request could not be completed right now. Please try again later.',
    languageChanged: 'English selected.',
    questionTooLong: 'The question is too long. The maximum is 2,000 characters.',
    rateLimited: 'You have reached the temporary question limit. Please try again shortly.',
    welcome: 'Welcome to the Islamic learning assistant. Choose a language, then send your question.',
  },
  sw: {
    chooseLanguage: 'Chagua lugha ya jibu:',
    error: 'Ombi halikuweza kukamilika sasa. Tafadhali jaribu tena baadaye.',
    languageChanged: 'Kiswahili kimechaguliwa.',
    questionTooLong: 'Swali ni refu sana. Kiwango cha juu ni herufi 2,000.',
    rateLimited: 'Umefikia kikomo cha muda cha maswali. Tafadhali jaribu tena baadaye.',
    welcome: 'Karibu kwenye msaidizi wa elimu ya Kiislamu. Chagua lugha, kisha tuma swali lako.',
  },
} as const;

export type MessageKey = keyof typeof copy.en;

export function message(language: AnswerLanguage, key: MessageKey): string {
  return copy[language][key];
}

export function parseLanguageCallback(data: string | undefined): AnswerLanguage | undefined {
  const match = /^language:(ar|en|sw)$/.exec(data ?? '');
  return match?.[1] as AnswerLanguage | undefined;
}
