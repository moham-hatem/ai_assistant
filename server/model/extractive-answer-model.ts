import type { AnswerInput, AnswerLanguage, AnswerModel, AnswerResult, Evidence } from '../domain.ts';
import { normalizeArabic, tokenize } from '../knowledge/arabic-text.ts';
import { expandKnowledgeQuery } from '../knowledge/query-expansion.ts';

const introductions: Record<AnswerLanguage, string> = {
  ar: 'بحسب المحتوى التعليمي المحلي:',
  en: 'According to the local educational content:',
  sw: 'Kulingana na maudhui ya elimu yaliyohifadhiwa:',
};

const stepLabels: Record<AnswerLanguage, string> = {
  ar: 'الخطوات:',
  en: 'Steps:',
  sw: 'Hatua:',
};

export class ExtractiveAnswerModel implements AnswerModel {
  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    const answer = extractRelevantText(input, evidence);
    return {
      answer: `${introductions[input.language]}\n\n${answer}`,
      grounded: true,
    };
  }
}

function extractRelevantText(input: AnswerInput, evidence: Evidence[]): string {
  const procedure = /(?:كيف|كيفية|طريقة|خطوات|مراحل|how|steps|jinsi|namna|hatua)/iu
    .test(input.question);
  const terms = queryTerms(input.question);
  const numbered = evidence.find((item) =>
    /Numbered sequence:/i.test(item.content) && overlapScore(item.content, terms) > 0);
  if (procedure && numbered) return clean(numbered.content, input.language);

  const blocks = evidence.flatMap((item, evidenceIndex) =>
    clean(item.content, input.language)
      .split(/\n\s*\n/u)
      .map((text, blockIndex) => ({
        blockIndex,
        evidenceIndex,
        score: overlapScore(text, terms) + cueBonus(text, input.question),
        text: text.trim(),
      }))
      .filter((block) => block.text.length > 0));
  const matched = blocks
    .filter((block) => block.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 6)
    .sort((first, second) =>
      first.evidenceIndex - second.evidenceIndex || first.blockIndex - second.blockIndex);
  const selected = matched.length > 0 ? matched : blocks.slice(0, 3);
  return withinLimit(selected.map((block) => block.text).join('\n\n'));
}

function queryTerms(question: string): string[] {
  return [...new Set(
    expandKnowledgeQuery(question)
      .flatMap((query) => tokenize(normalizeArabic(query)))
      .filter((term) => term.length >= 3),
  )];
}

function overlapScore(text: string, terms: string[]): number {
  const contentTerms = new Set(tokenize(normalizeArabic(text)));
  return terms.reduce((score, term) => score + Number(contentTerms.has(term)), 0);
}

function cueBonus(text: string, question: string): number {
  const value = text.trim();
  if (/^ما هي/u.test(value) && /ما هي/u.test(question)) return 3;
  if (/^وقتها:/u.test(value) && /وقت/u.test(question)) return 3;
  if (/^كيفيتها?:/u.test(value) && /كيف/u.test(question)) return 3;
  if (/^what\b/iu.test(value) && /\bwhat\b/iu.test(question)) return 3;
  if (/^when\b/iu.test(value) && /\bwhen\b/iu.test(question)) return 3;
  if (/^how\b/iu.test(value) && /\bhow\b/iu.test(question)) return 3;
  if (/^(?:ni nini|wakati|jinsi|namna)\b/iu.test(value)
    && /\b(?:ni nini|wakati|jinsi|namna)\b/iu.test(question)) return 3;
  return 0;
}

function clean(content: string, language: AnswerLanguage): string {
  return content
    .replace(/^\[PDF page \d+\]\s*/gimu, '')
    .replace(/Numbered sequence:/giu, stepLabels[language])
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function withinLimit(text: string, maximum = 1_800): string {
  if (text.length <= maximum) return text;
  const shortened = text.slice(0, maximum);
  const boundary = Math.max(shortened.lastIndexOf('\n'), shortened.lastIndexOf('. '));
  return `${shortened.slice(0, boundary > maximum * 0.6 ? boundary : maximum).trim()}…`;
}
