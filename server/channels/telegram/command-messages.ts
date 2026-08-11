import type { AnswerLanguage } from '../../domain.ts';

const copy = {
  ar: {
    help: 'أرسل سؤالك نصًا وسأجيب من المحتوى التعليمي المتاح.\n\nالأوامر:\n/start بدء جديد\n/language تغيير لغة الإجابة\n/reset مسح سياق المحادثة المؤقت\n/privacy معلومات الخصوصية\n/help عرض هذه المساعدة',
    privacy: 'الخصوصية: لا تحفظ قاعدة بيانات Telegram الخاصة بالمشروع نص رسائلك أو سجل المحادثة. لكن سجل الأسئلة المركزي في المشروع يحفظ السؤال والنتيجة وبيانات التنفيذ للمراجعة وتحسين الجودة. وتخضع الرسائل أيضًا لسياسة خصوصية Telegram.',
    reset: 'تم مسح سياق المحادثة المؤقت من الذاكرة. لا يحذف ذلك سجلات الأسئلة المحفوظة مركزيًا للمراجعة.',
    textOnly: 'أرسل سؤالك في رسالة نصية. الصور والملفات والرسائل الصوتية غير مدعومة حاليًا.',
    unknownCommand: 'هذا الأمر غير معروف. استخدم /help لعرض الأوامر المتاحة.',
  },
  en: {
    help: 'Send your question as text and I will answer from the available educational content.\n\nCommands:\n/start start again\n/language change answer language\n/reset clear temporary conversation context\n/privacy privacy information\n/help show this help',
    privacy: 'Privacy: the project’s Telegram database does not store your message text or conversation history. However, the project’s central question log stores the question, outcome, and execution data for review and quality improvement. Messages are also subject to Telegram’s privacy policy.',
    reset: 'The temporary conversation context was cleared from memory. This does not delete question records kept centrally for review.',
    textOnly: 'Send your question in a text message. Images, files, and voice messages are not supported yet.',
    unknownCommand: 'That command is not recognized. Use /help to see the available commands.',
  },
  sw: {
    help: 'Tuma swali lako kama maandishi nami nitajibu kutoka kwenye maudhui ya elimu yanayopatikana.\n\nAmri:\n/start anza tena\n/language badilisha lugha ya jibu\n/reset futa muktadha wa muda\n/privacy taarifa za faragha\n/help onyesha msaada huu',
    privacy: 'Faragha: hifadhidata ya Telegram ya mradi haihifadhi maandishi ya ujumbe wako wala historia ya mazungumzo. Hata hivyo, kumbukumbu kuu ya maswali ya mradi huhifadhi swali, matokeo, na data ya utekelezaji kwa ukaguzi na kuboresha ubora. Ujumbe pia unategemea sera ya faragha ya Telegram.',
    reset: 'Muktadha wa muda wa mazungumzo umefutwa kutoka kwenye kumbukumbu. Hii haifuti rekodi za maswali zinazohifadhiwa katika kumbukumbu kuu kwa ukaguzi.',
    textOnly: 'Tuma swali lako kwa ujumbe wa maandishi. Picha, faili, na ujumbe wa sauti bado havitumiki.',
    unknownCommand: 'Amri hiyo haitambuliki. Tumia /help kuona amri zinazopatikana.',
  },
} as const;

export type CommandMessageKey = keyof typeof copy.en;

export function commandMessage(language: AnswerLanguage, key: CommandMessageKey): string {
  return copy[language][key];
}

export function privateOnlyMessage(): string {
  return [
    'يرجى مراسلة البوت في محادثة خاصة.',
    'Please message the bot in a private chat.',
    'Tafadhali tuma ujumbe kwa bot kwenye mazungumzo ya faragha.',
  ].join('\n');
}

export function closedBetaMessage(): string {
  return [
    'تجربة مغلقة؛ استخدم رابط دعوتك.',
    'Closed beta; use your invitation link.',
    'Jaribio limefungwa; tumia kiungo chako cha mwaliko.',
  ].join('\n');
}
