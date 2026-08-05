import type { AnswerInput, AnswerLanguage, AnswerModel, AnswerResult, Evidence } from '../domain.ts';
import type { TextTranslator, TranslationLanguageCode } from './text-translator.ts';

const introductions: Record<AnswerLanguage, string> = {
  ar: 'بحسب المحتوى التعليمي المحلي:',
  en: 'According to the local educational content:',
  sw: 'Kulingana na maudhui ya elimu yaliyohifadhiwa:',
};

const targets: Record<AnswerLanguage, TranslationLanguageCode> = {
  ar: 'arb_Arab',
  en: 'eng_Latn',
  sw: 'swh_Latn',
};

export class LocalTranslationAnswerModel implements AnswerModel {
  private readonly translator: TextTranslator;

  constructor(translator: TextTranslator) {
    this.translator = translator;
  }

  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    const cleaned = evidence.map(clean).filter(Boolean);
    const substantive = cleaned.filter((content) => content.length >= 140);
    const selected = (substantive.length > 0 ? substantive : cleaned).slice(0, 3);
    const target = targets[input.language];
    const translated: string[] = [];
    for (const content of selected) {
      const source = detectTranslationLanguage(content);
      const translatedSegments: string[] = [];
      for (const segment of segmentForTranslation(content)) {
        const result = await this.translator.translate(segment, source, target);
        translatedSegments.push(cleanTranslation(result));
      }
      translated.push(translatedSegments.join(' '));
    }
    const answer = translated.join('\n\n');
    return { answer: `${introductions[input.language]}\n\n${answer}`, grounded: true };
  }
}

function cleanTranslation(value: string): string {
  return value
    .replace(/["“”]+/gu, '')
    .replace(/\s+([.,!?؟])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
}

function segmentForTranslation(content: string): string[] {
  const segments = content
    .split(/(?<=[.!?؟])\s+|\n(?=\d{1,2}[.)-]\s+)/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments.slice(0, 8) : [content];
}

export function detectTranslationLanguage(value: string): TranslationLanguageCode {
  const arabic = value.match(/\p{Script=Arabic}/gu)?.length ?? 0;
  const cyrillic = value.match(/\p{Script=Cyrillic}/gu)?.length ?? 0;
  const latin = value.match(/[A-Za-z]/gu)?.length ?? 0;
  if (cyrillic > Math.max(arabic, latin)) return 'rus_Cyrl';
  if (arabic > latin * 0.4) return 'arb_Arab';

  const words = value.toLowerCase().match(/[a-z]+/gu) ?? [];
  const swahiliMarkers = new Set([
    'allah', 'dini', 'elimu', 'hivyo', 'katika', 'kwa', 'kujifunza', 'mola',
    'muislamu', 'mungu', 'mwenyezi', 'na', 'pepo', 'uislamu', 'wako', 'yako',
  ]);
  const swahiliScore = new Set(words.filter((word) => swahiliMarkers.has(word))).size;
  return swahiliScore >= 3 ? 'swh_Latn' : 'eng_Latn';
}

function clean(evidence: Evidence): string {
  const lines = evidence.content
    .replace(/^\[PDF page \d+\]\s*/gimu, '')
    .replace(/\brehema na amani zimfikie\b/giu, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0
      && !/^\d+$/u.test(line)
      && !/^(?:Hisnu|Al Muhtady|Usigeuzi|Elimu)$/iu.test(line)
      && !/^(?:imepokolewa|imesahihishwa)\b/iu.test(line))
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .map((line) => {
      const startsQuotedSentence = /^["'·]+\s*/u.test(line);
      const cleanedLine = line.replace(/["'·]+/gu, '').trim();
      return startsQuotedSentence ? `. ${cleanedLine}` : cleanedLine;
    });
  const hasNumberedSteps = lines.some((line) => /^\d{1,2}[.)-]\s+/u.test(line));
  return lines
    .join(hasNumberedSteps ? '\n' : ' ')
    .replace(/^\.\s+/u, '')
    .replace(/\s+([.!?؟])/gu, '$1')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
