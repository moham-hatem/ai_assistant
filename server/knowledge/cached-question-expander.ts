import type { QuestionExpander } from '../domain.ts';
import type { QuestionExpansionCache } from './question-expansion-cache.ts';

export class CachedQuestionExpander implements QuestionExpander {
  private readonly cache: QuestionExpansionCache;
  private readonly expander: QuestionExpander;

  constructor(
    expander: QuestionExpander,
    cache: QuestionExpansionCache,
  ) {
    this.expander = expander;
    this.cache = cache;
  }

  async expand(question: string): Promise<string[]> {
    const cached = await this.cache.get(question);
    if (cached) return cached;
    const alternatives = await this.expander.expand(question);
    if (alternatives.length > 0) await this.cache.set(question, alternatives);
    return alternatives;
  }
}
