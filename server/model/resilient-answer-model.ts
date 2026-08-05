import type { AnswerInput, AnswerModel, AnswerResult, Evidence } from '../domain.ts';
import { insufficientEvidenceAnswer } from '../domain.ts';
import { AppError } from '../errors.ts';
import { assertSelectedLanguage } from './answer-quality.ts';

export class ResilientAnswerModel implements AnswerModel {
  private readonly fallback: AnswerModel;
  private readonly primary: AnswerModel;

  constructor(primary: AnswerModel, fallback: AnswerModel) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    try {
      return await this.primary.answer(input, evidence);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'MODEL_UNAVAILABLE') throw error;
      console.warn('External answer models unavailable; returning a grounded local extract.');
      try {
        const result = await this.fallback.answer(input, evidence);
        assertSelectedLanguage(result.answer, input.language);
        return result;
      } catch (fallbackError) {
        console.warn('Local translated fallback unavailable.', fallbackError);
        return { answer: insufficientEvidenceAnswer(input.language), grounded: false };
      }
    }
  }
}
