import type { AnswerInput, AnswerModel, AnswerResult, Evidence } from '../domain.ts';
import { AppError } from '../errors.ts';
import { assertAnswerQuality } from './answer-quality.ts';
import { parseGroundedAnswer } from './parse-answer.ts';
import { buildPrompt, buildSystemInstruction } from './prompt.ts';

interface OpenCodeOptions {
  apiKey: string;
  endpoint: string;
  fallbackModels?: string[];
  fetcher?: typeof fetch;
  model: string;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OpenCodeModel implements AnswerModel {
  private readonly options: OpenCodeOptions;

  constructor(options: OpenCodeOptions) {
    this.options = options;
  }

  async answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult> {
    let primaryError: unknown;
    try {
      return await this.requestWithRetry(this.options.model, input, evidence);
    } catch (error) {
      primaryError = error;
      if (!(error instanceof ModelInsufficientEvidenceError)) this.logFailure(this.options.model, error);
      this.throwIfAuthenticationFailed(error);
    }

    const fallbackModels = (this.options.fallbackModels ?? [])
      .filter((model, index, models) => model !== this.options.model && models.indexOf(model) === index);
    if (fallbackModels.length === 0) {
      if (primaryError instanceof ModelInsufficientEvidenceError) return primaryError.result;
      return this.unavailable(primaryError);
    }

    try {
      return await Promise.any(fallbackModels.map(async (model) => {
        try {
          return await this.requestWithRetry(model, input, evidence);
        } catch (error) {
          if (!(error instanceof ModelInsufficientEvidenceError)) this.logFailure(model, error);
          throw error;
        }
      }));
    } catch (error) {
      const insufficient = [primaryError, ...aggregateErrors(error)]
        .find((item): item is ModelInsufficientEvidenceError =>
          item instanceof ModelInsufficientEvidenceError);
      if (insufficient) return insufficient.result;
      return this.unavailable(error);
    }
  }

  private unavailable(cause?: unknown): never {
    throw new AppError(
      'MODEL_UNAVAILABLE',
      'نماذج الإجابة مشغولة حاليًا. حاول إرسال السؤال مرة أخرى بعد قليل.',
      503,
      { cause },
    );
  }

  private logFailure(model: string, error: unknown) {
    console.warn(
      `OpenCode model failed (${model}):`,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }

  private throwIfAuthenticationFailed(error: unknown): void {
    if (error instanceof OpenCodeHttpError && [401, 403].includes(error.status)) {
      throw new AppError(
        'MODEL_NOT_CONFIGURED',
        'مفتاح OpenCode غير صالح أو لا يملك صلاحية استخدام الموديل.',
        503,
      );
    }
  }

  private async request(
    model: string,
    input: AnswerInput,
    evidence: Evidence[],
  ): Promise<AnswerResult> {
    const response = await (this.options.fetcher ?? fetch)(this.options.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemInstruction(input.language) },
          { role: 'user', content: buildPrompt(input, evidence) },
        ],
        temperature: 0,
        max_tokens: 900,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    const payload = parseResponse(await response.text(), response.status);
    if (!response.ok) {
      throw new OpenCodeHttpError(response.status, payload.error?.message ?? 'unknown');
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content?.trim()) throw new Error(`OpenCode model ${model} returned an empty response.`);
    const result: AnswerResult = {
      ...parseGroundedAnswer(content, evidence.length, input.language),
      generation: { provider: 'opencode', model },
    };
    if (!result.grounded) throw new ModelInsufficientEvidenceError(result);
    assertAnswerQuality(result, evidence, input.language, input.question);
    return result;
  }

  private async requestWithRetry(
    model: string,
    input: AnswerInput,
    evidence: Evidence[],
  ): Promise<AnswerResult> {
    try {
      return await this.request(model, input, evidence);
    } catch (error) {
      if (!isRetryable(error)) throw error;
      console.warn(`Retrying transient OpenCode failure (${model}).`);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return this.request(model, input, evidence);
    }
  }
}

class ModelInsufficientEvidenceError extends Error {
  readonly result: AnswerResult;

  constructor(result: AnswerResult) {
    super('The model declined the supplied evidence.');
    this.name = 'ModelInsufficientEvidenceError';
    this.result = result;
  }
}

function aggregateErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors : [error];
}

class OpenCodeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`OpenCode request failed (${status}): ${message}`);
    this.name = 'OpenCodeHttpError';
    this.status = status;
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenCodeHttpError) return error.status >= 500;
  if (error instanceof TypeError) return true;
  return error instanceof Error
    && /returned (?:an empty|a non-JSON) response/i.test(error.message);
}

function parseResponse(text: string, status: number): ChatCompletionResponse {
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new Error(`OpenCode returned a non-JSON response (${status}).`);
  }
}
