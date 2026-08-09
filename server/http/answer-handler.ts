import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnswerService } from '../answer-service.ts';
import type { AnswerInput, AnswerResult } from '../domain.ts';
import type { QuestionLogRecord } from '../../shared/contracts/question-log.ts';
import type { QuestionLogWriter } from '../modules/question-log/question-log-service.ts';
import { createPublicErrorResponse, sendError, type ErrorLogger } from './error-response.ts';
import { readJson, sendJson } from './json.ts';
import { parseAnswerInput } from './parse-input.ts';

export function createAnswerHandler(
  service: AnswerService,
  questionLog: QuestionLogWriter,
  logError: ErrorLogger,
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const requestId = crypto.randomUUID();

    if (request.method !== 'POST') {
      sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', requestId });
      return;
    }

    const startedAt = new Date();
    const startedAtMonotonic = performance.now();
    let input: AnswerInput | undefined;

    try {
      input = parseAnswerInput(await readJson(request));
      const execution = await service.answerWithContext(input);
      const completedAt = new Date();
      await safeRecord(questionLog, toCompletedRecord({
        completedAt,
        evidenceReferences: execution.evidenceReferences,
        input,
        latencyMs: elapsedMilliseconds(startedAtMonotonic),
        requestId,
        result: execution.result,
        startedAt,
      }));
      sendJson(response, 200, {
        answer: execution.result.answer,
        grounded: execution.result.grounded,
        requestId,
      });
    } catch (error) {
      if (input) {
        const completedAt = new Date();
        const publicError = createPublicErrorResponse(requestId, error);
        await safeRecord(questionLog, {
          answer: null,
          answerLanguage: input.language,
          apology: publicError.body.message ?? publicError.body.code,
          channel: 'web',
          completedAt: completedAt.toISOString(),
          evidenceReferences: [],
          grounded: null,
          id: requestId,
          latencyMs: elapsedMilliseconds(startedAtMonotonic),
          model: null,
          provider: null,
          question: input.question,
          startedAt: startedAt.toISOString(),
          status: 'failed',
          sufficiency: 'unknown',
        });
      }
      sendError(response, requestId, error, logError);
    }
  };
}

function toCompletedRecord(options: {
  completedAt: Date;
  evidenceReferences: string[];
  input: AnswerInput;
  latencyMs: number;
  requestId: string;
  result: AnswerResult;
  startedAt: Date;
}): QuestionLogRecord {
  const answered = options.result.grounded;
  return {
    answer: answered ? options.result.answer : null,
    answerLanguage: options.input.language,
    apology: answered ? null : options.result.answer,
    channel: 'web',
    completedAt: options.completedAt.toISOString(),
    evidenceReferences: options.evidenceReferences,
    grounded: options.result.grounded,
    id: options.requestId,
    latencyMs: options.latencyMs,
    model: options.result.generation?.model ?? null,
    provider: options.result.generation?.provider ?? null,
    question: options.input.question,
    startedAt: options.startedAt.toISOString(),
    status: answered ? 'answered' : 'declined',
    sufficiency: answered ? 'sufficient' : 'insufficient',
  };
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function safeRecord(questionLog: QuestionLogWriter, record: QuestionLogRecord): Promise<void> {
  try {
    await questionLog.record(record);
  } catch {
    // The audit log must never replace or corrupt the user-facing answer response.
  }
}
