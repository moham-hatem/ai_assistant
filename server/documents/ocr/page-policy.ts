import type { PageOcrDecision, PageOcrDecisionPolicy } from './types.ts';

export interface TextQualityPolicyOptions {
  maxSuspiciousCharacterRatio?: number;
  minCharacters?: number;
  minWords?: number;
}

export class TextQualityOcrPolicy implements PageOcrDecisionPolicy {
  private readonly maxSuspiciousCharacterRatio: number;
  private readonly minCharacters: number;
  private readonly minWords: number;

  constructor(options: TextQualityPolicyOptions = {}) {
    this.maxSuspiciousCharacterRatio = options.maxSuspiciousCharacterRatio ?? 0.18;
    this.minCharacters = options.minCharacters ?? 80;
    this.minWords = options.minWords ?? 12;
  }

  evaluate(text: string): PageOcrDecision {
    const content = text.replace(/^\[PDF page \d+\]\s*/u, '').trim();
    const characters = [...content].filter((character) => !/\s/u.test(character));
    const words = content.split(/\s+/u).filter(Boolean);
    const suspicious = characters.filter((character) => /[\u0000-\u001F\uFFFD]/u.test(character)).length;
    const suspiciousRatio = suspicious / Math.max(characters.length, 1);
    const reasons: string[] = [];
    if (characters.length < this.minCharacters) reasons.push('too_few_characters');
    if (words.length < this.minWords) reasons.push('too_few_words');
    if (suspiciousRatio > this.maxSuspiciousCharacterRatio) reasons.push('suspicious_characters');

    const characterScore = Math.min(1, characters.length / Math.max(this.minCharacters, 1));
    const wordScore = Math.min(1, words.length / Math.max(this.minWords, 1));
    const cleanScore = 1 - Math.min(1, suspiciousRatio / Math.max(this.maxSuspiciousCharacterRatio, 0.001));
    return {
      confidence: (characterScore + wordScore + cleanScore) / 3,
      needsOcr: reasons.length > 0,
      reasons,
    };
  }
}
