import { insufficientEvidenceAnswer, type AnswerLanguage, type AnswerResult } from '../domain.ts';

export function parseGroundedAnswer(
  content: string,
  evidenceCount: number,
  language: AnswerLanguage = 'ar',
): AnswerResult {
  if (content.trim() === 'INSUFFICIENT') {
    return { answer: insufficientEvidenceAnswer(language), grounded: false };
  }

  const answer = content.match(/<answer>([\s\S]*?)<\/answer>/i)?.[1]?.trim();
  const evidenceText = content.match(/<evidence>([\s\S]*?)<\/evidence>/i)?.[1] ?? '';
  const hasValidEvidence = extractNumbers(evidenceText)
    .some((value) => Number.isInteger(value) && value >= 1 && value <= evidenceCount);

  return answer && hasValidEvidence
    ? { answer, grounded: true }
    : { answer: insufficientEvidenceAnswer(language), grounded: false };
}

function extractNumbers(value: string): number[] {
  const normalized = value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return [...normalized.matchAll(/\d+/g)].map((match) => Number(match[0]));
}
