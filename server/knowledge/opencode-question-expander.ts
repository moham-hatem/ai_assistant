import type { QuestionExpander } from '../domain.ts';

interface QuestionExpanderOptions {
  apiKey: string;
  endpoint: string;
  fallbackModels?: string[];
  fetcher?: typeof fetch;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenCodeQuestionExpander implements QuestionExpander {
  private readonly options: QuestionExpanderOptions;

  constructor(options: QuestionExpanderOptions) {
    this.options = options;
  }

  async expand(question: string): Promise<string[]> {
    let primaryError: unknown;
    try {
      return await this.request(this.options.model, question);
    } catch (error) {
      primaryError = error;
      this.logFailure(this.options.model, error);
    }

    const fallbackModels = (this.options.fallbackModels ?? [])
      .filter((model, index, models) => model !== this.options.model && models.indexOf(model) === index);
    if (fallbackModels.length === 0) throw primaryError;

    try {
      return await Promise.any(fallbackModels.map(async (model) => {
        try {
          return await this.request(model, question);
        } catch (error) {
          this.logFailure(model, error);
          throw error;
        }
      }));
    } catch (error) {
      throw new AggregateError([primaryError, ...aggregateErrors(error)], 'All question expansion models failed.');
    }
  }

  private async request(model: string, question: string): Promise<string[]> {
    const response = await (this.options.fetcher ?? fetch)(this.options.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `Rewrite search questions for multilingual retrieval. Do not answer the question.
Return only a JSON array with 3 to 6 short search phrases.
Include accurate Arabic, English, and Kiswahili translations, plus common technical transliterations or equivalent religious terms.
Preserve the user's exact meaning and question type. Never turn a definition, comparison, or procedure into a question about causes, benefits, conditions, or another related topic.
Do not add explanations, facts, Markdown, or labels.`,
          },
          { role: 'user', content: question },
        ],
        temperature: 0,
        max_tokens: 280,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) throw new Error(`Question expansion failed (${response.status}).`);
    const payload = JSON.parse(await response.text()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('Question expansion returned an empty response.');
    return parseAlternatives(content, question);
  }

  private logFailure(model: string, error: unknown): void {
    console.warn(
      `Question expansion model failed (${model}):`,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
}

function aggregateErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors : [error];
}

export function parseAlternatives(content: string, original: string): string[] {
  const json = content.match(/\[[\s\S]*\]/u)?.[0];
  if (!json) throw new Error('Question expansion did not return a JSON array.');
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Question expansion payload is not an array.');
  const normalizedOriginal = normalize(original);
  const alternatives = parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 3
      && item.length <= 300
      && normalize(item) !== normalizedOriginal
      && !mixesArabicAndLatin(item)
      && !changesQuestionIntent(item, original));
  const unique = [...new Set(alternatives)].slice(0, 6);
  if (!isLikelySwahili(original) && !unique.some(isLikelySwahili)) {
    throw new Error('Question expansion omitted the required Kiswahili search phrase.');
  }
  return unique;
}

function mixesArabicAndLatin(value: string): boolean {
  return /\p{Script=Arabic}/u.test(value) && /[A-Za-z]/u.test(value);
}

function changesQuestionIntent(alternative: string, original: string): boolean {
  const intent = /(?:causes?|reasons?|benefits?|conditions?|invalidators?|steps?|how to|أسباب|شروط|فوائد|نواقض|خطوات|كيفية|sababu|faida|masharti|vitenguzi|hatua|jinsi|namna)/iu;
  return intent.test(alternative) && !intent.test(original);
}

function isLikelySwahili(value: string): boolean {
  return /\b(?:kwa|katika|kwanini|nini|jinsi|namna|hatua|sababu|umuhimu|muislamu|mwislamu|uislamu|dini|elimu|kujifunza|kutafuta|kuendelea|hadathi|tofauti|maana|lazima|pepo)\b/iu
    .test(value);
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
