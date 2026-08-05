import type { AnswerLanguage, AnswerResult, Evidence } from '../domain.ts';

export function assertAnswerQuality(
  result: AnswerResult,
  evidence: Evidence[],
  language: AnswerLanguage = 'ar',
  question = '',
): void {
  assertSelectedLanguage(result.answer, language);
  if (/(?:#{1,6}\s|\*\*)/u.test(result.answer)) {
    throw new Error('The model returned unsupported Markdown formatting.');
  }

  const procedureRequested = question.length === 0
    || /(?:كيف|كيفية|طريقة|خطوات|مراحل|how|steps?|procedure|jinsi|namna|hatua)/iu.test(question);
  const procedure = procedureRequested
    ? evidence.find((item) => /Numbered sequence:/i.test(item.content))
    : undefined;
  if (!procedure) return;
  if (!result.grounded) throw new Error('The model rejected direct numbered evidence.');

  const expectedSteps = procedure.content.match(/^\d{1,2}\.\s+/gm)?.length ?? 0;
  const answeredSteps = result.answer.match(/^(?:\d{1,2}|[٠-٩]{1,2})[.)-]\s+/gm)?.length ?? 0;
  if (expectedSteps >= 3 && answeredSteps < expectedSteps) {
    throw new Error(`The model returned ${answeredSteps} of ${expectedSteps} required steps.`);
  }

  if (/(?:^|\s)(?:مرة|مرتين|ثلاث(?:ًا|ا)?|ثلاث مرات|once|twice|three times|mara (?:moja|mbili|tatu))(?=\s|[.،,؛;])/iu.test(result.answer)) {
    throw new Error('The model added an unsupported repetition count.');
  }
  if (/(?:السواك|التسمية|المبين أعلاه|siwak|bismillah|mswaki|steps? (?:shown|listed) above)/iu.test(result.answer)) {
    throw new Error('The model added an unsupported practice or omitted the explicit steps.');
  }
}

const swahiliMarkers = new Set([
  'alizokuja', 'aliyoyakataza', 'hapana', 'hatua', 'jinsi', 'katika', 'kichwani',
  'kufanya', 'kufunga', 'kukusudia', 'kumsadikisha', 'kupenga', 'kupitisha',
  'kusukutua', 'kutii', 'kuosha', 'kwamba', 'kwenye', 'maana', 'maji', 'mambo',
  'masikioni', 'mguu', 'miguu', 'mikono', 'moyo', 'mungu', 'mwenyezi', 'namna',
  'sheria', 'tunamuabudu', 'vifundo', 'viganja', 'viwili', 'wote', 'yake',
]);

const englishMarkers = new Set([
  'a', 'ablution', 'all', 'an', 'and', 'answer', 'are', 'as', 'by', 'ears', 'face',
  'feet', 'first', 'for', 'from', 'god', 'hands', 'has', 'head', 'in', 'is', 'it',
  'meaning', 'of', 'one', 'prayer', 'second', 'steps', 'that', 'the', 'this', 'to',
  'two', 'wash', 'water', 'which', 'with', 'worship',
]);

export function assertSelectedLanguage(answer: string, language: AnswerLanguage): void {
  if (/\p{Script=Han}/u.test(answer)) throw foreignLanguageError();

  const hasArabic = /\p{Script=Arabic}/u.test(answer);
  const hasLatin = /[A-Za-z]/u.test(answer);
  if (language === 'ar') {
    if (!hasArabic || hasLatin) throw foreignLanguageError();
    return;
  }
  if (hasArabic || !hasLatin) throw foreignLanguageError();

  const words = answer.toLowerCase().match(/[a-z]+/gu) ?? [];
  const swahiliScore = languageScore(words, swahiliMarkers);
  const englishScore = languageScore(words, englishMarkers);
  if (language === 'en' && swahiliScore >= 3) throw foreignLanguageError();
  if (language === 'sw' && englishScore >= 4 && englishScore > swahiliScore) {
    throw foreignLanguageError();
  }
}

function languageScore(words: string[], markers: Set<string>): number {
  return new Set(words.filter((word) => markers.has(word))).size;
}

function foreignLanguageError(): Error {
  return new Error('The answer does not use only the selected language.');
}
