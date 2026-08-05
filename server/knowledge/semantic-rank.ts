import type { Evidence } from '../domain.ts';
import { normalizeArabic, tokenize } from './arabic-text.ts';

export interface EmbeddedEvidence extends Evidence {
  vector: number[];
}

export function rankSemanticEvidence(
  items: EmbeddedEvidence[],
  queries: number[][],
  limit: number,
  minimumScore: number,
  question = '',
  alternatives: string[] = [],
): Evidence[] {
  const procedureQuestion = /(?:كيف|كيفية|طريقة|خطوات|مراحل)/u.test(question);
  return items
    .map((item) => {
      const semanticScore = Math.max(...queries.map((query) => dot(item.vector, query)));
      const structureBonus = procedureQuestion && hasNumberedProcedure(item.content) ? 0.12 : 0;
      const lexicalBonus = Math.max(
        exactTermBonus(item.content, question),
        ...alternatives.map((alternative) => exactTermBonus(item.content, alternative)),
      );
      return { item, score: semanticScore + structureBonus + lexicalBonus, semanticScore };
    })
    .filter(({ semanticScore }) => semanticScore >= minimumScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => ({ id: item.id, content: item.content }));
}

function exactTermBonus(content: string, question: string): number {
  const contentTerms = new Set(tokenize(normalizeArabic(content)));
  const questionTerms = [...new Set(tokenize(normalizeArabic(question)))]
    .filter((term) => term.length >= 3);
  const matches = questionTerms.filter((term) => contentTerms.has(term)).length;
  return Math.min(matches * 0.06, 0.3);
}

function hasNumberedProcedure(content: string): boolean {
  return /Numbered sequence:/i.test(content)
    || /(?:^|\n)\s*1[.)-]\s+.+\n\s*2[.)-]\s+/u.test(content);
}

function dot(first: number[], second: number[]): number {
  if (first.length !== second.length) return Number.NEGATIVE_INFINITY;
  return first.reduce((total, value, index) => total + value * second[index], 0);
}
