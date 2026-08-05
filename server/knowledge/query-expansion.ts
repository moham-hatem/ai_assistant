import { normalizeArabic } from './arabic-text.ts';

const domainAliases: Array<{ aliases: string; matches: (question: string) => boolean }> = [
  {
    aliases: 'wudu udhu kutawadha ablution steps namna ya kutawadha',
    matches: (question) => /(?:وضوء|اتوضا|wudu|udhu|ablution|kutawadha|tawadha)/u.test(question),
  },
  {
    aliases: 'meaning of la ilaha illa Allah maana ya hapana mwabudiwa wa haki ila Allah',
    matches: (question) => question.includes('لا اله الا الله')
      || /la ilaha illa (?:allah|allaah)|hapana mwabudiwa wa haki ila|there is no (?:god|deity) but (?:god|allah)|no (?:god|deity) (?:is worthy of worship )?except (?:god|allah)/i.test(question),
  },
  {
    aliases: [
      'five pillars of Islam',
      'nguzo tano za Uislamu nguzo za dini',
      'shahada mbili kusimamisha swala kutoa zaka kufunga mwezi wa ramadhaani Hajj',
    ].join(' '),
    matches: (question) => /(?:اركان الاسلام|دعائم الاسلام|five pillars|pillars of islam|nguzo (?:tano|za (?:dini|uislamu)))/iu
      .test(question),
  },
  {
    aliases: [
      'major ritual impurity and minor ritual impurity purification difference',
      'hadathi kubwa kwa kuoga hadathi ndogo kwa kutawadha',
    ].join(' '),
    matches: (question) => /(?:الحدث\s+(?:الأ|الا)?كبر|الحدث\s+(?:الأ|الا)?صغر|major ritual impurity|minor ritual impurity|hadathi (?:kubwa|ndogo))/iu
      .test(question),
  },
];

export function expandKnowledgeQuery(question: string): string[] {
  const normalized = normalizeArabic(question);
  const expansions = domainAliases
    .filter((entry) => entry.matches(normalized))
    .map((entry) => entry.aliases);
  return [question, ...expansions];
}
