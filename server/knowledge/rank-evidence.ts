import type { Evidence } from '../domain.ts';
import { normalizeArabic, tokenize } from './arabic-text.ts';

function score(content: string, question: string, terms: string[]): number {
  const normalizedContent = normalizeArabic(content);
  const contentTerms = new Set(tokenize(content));
  const overlap = terms.reduce((total, term) => total + Number(contentTerms.has(term)), 0);
  const exactMatch = question.length >= 8 && normalizedContent.includes(question);
  return overlap + (exactMatch ? terms.length + 3 : 0);
}

export function rankEvidence(chunks: Evidence[], question: string, limit: number): Evidence[] {
  const normalizedQuestion = normalizeArabic(question);
  const terms = [...new Set(tokenize(question))];

  return chunks
    .map((chunk) => ({ chunk, score: score(chunk.content, normalizedQuestion, terms) }))
    .filter((result) => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}
