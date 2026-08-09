import type { QuestionLogRecord } from '../shared/contracts/question-log.ts';
import type { AnswerExecution } from './answer-service.ts';
import type { AnswerInput } from './domain.ts';
import { AppError } from './errors.ts';

export type AnswerRequestChannel = 'telegram' | 'web';

interface RecordContext {
  channel: AnswerRequestChannel;
  completedAt: Date;
  input: AnswerInput;
  latencyMs: number;
  requestId: string;
  startedAt: Date;
}

export function completedRecord(
  options: RecordContext & { execution: AnswerExecution },
): QuestionLogRecord {
  const { result } = options.execution;
  const answered = result.grounded;
  return baseRecord(options, {
    answer: answered ? result.answer : null,
    apology: answered ? null : result.answer,
    evidenceReferences: options.execution.evidenceReferences,
    grounded: result.grounded,
    model: result.generation?.model ?? null,
    provider: result.generation?.provider ?? null,
    status: answered ? 'answered' : 'declined',
    sufficiency: answered ? 'sufficient' : 'insufficient',
  });
}

export function failedRecord(
  options: RecordContext & { error: unknown },
): QuestionLogRecord {
  return baseRecord(options, {
    answer: null,
    apology: options.error instanceof AppError ? options.error.message : 'SERVICE_UNAVAILABLE',
    evidenceReferences: [],
    grounded: null,
    model: null,
    provider: null,
    status: 'failed',
    sufficiency: 'unknown',
  });
}

function baseRecord(
  options: RecordContext,
  outcome: Pick<QuestionLogRecord,
    'answer' | 'apology' | 'evidenceReferences' | 'grounded' | 'model' | 'provider' | 'status' | 'sufficiency'>,
): QuestionLogRecord {
  return {
    ...outcome,
    answerLanguage: options.input.language,
    channel: options.channel,
    completedAt: options.completedAt.toISOString(),
    id: options.requestId,
    latencyMs: options.latencyMs,
    question: options.input.question,
    startedAt: options.startedAt.toISOString(),
  };
}

export function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
