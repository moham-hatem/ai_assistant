import type { AnswerInput, AnswerModel, AnswerResult, Evidence } from '../domain.ts';
import type { AnswerCache } from './answer-cache.ts';
import { assertAnswerQuality } from './answer-quality.ts';

export class CachedAnswerModel implements AnswerModel {
  private readonly cache: AnswerCache;
  private readonly model: AnswerModel;

  constructor(model: AnswerModel, cache: AnswerCache) {
    this.model = model;
    this.cache = cache;
  }

  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    const cached = await this.cache.get(input, evidence);
    if (cached) {
      try {
        assertAnswerQuality(cached, evidence, input.language, input.question);
        return cached;
      } catch {
        await this.cache.delete(input, evidence);
      }
    }

    const result = await this.model.answer(input, evidence);
    if (result.grounded) assertAnswerQuality(result, evidence, input.language, input.question);
    await this.cache.set(input, evidence, result);
    return result;
  }
}
