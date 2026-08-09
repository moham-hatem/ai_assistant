import type { AnswerService } from './answer-service.ts';
import type { AnswerInput } from './domain.ts';
import type { QuestionLogRecord } from '../shared/contracts/question-log.ts';
import type { QuestionLogWriter } from './modules/question-log/question-log-service.ts';
import {
  completedRecord,
  elapsedMilliseconds,
  failedRecord,
  type AnswerRequestChannel,
} from './answer-request-record.ts';

export type { AnswerRequestChannel } from './answer-request-record.ts';

export interface AnswerRequestResult {
  answer: string;
  grounded: boolean;
  requestId: string;
}

type AnswerExecutor = Pick<AnswerService, 'answerWithContext'>;

export class AnswerRequestService {
  private readonly answers: AnswerExecutor;
  private readonly failedRequestIds = new WeakMap<object, string>();
  private readonly questionLog: QuestionLogWriter;

  constructor(
    answers: AnswerExecutor,
    questionLog: QuestionLogWriter,
  ) {
    this.answers = answers;
    this.questionLog = questionLog;
  }

  async answer(input: AnswerInput, channel: AnswerRequestChannel): Promise<AnswerRequestResult> {
    const requestId = crypto.randomUUID();
    const startedAt = new Date();
    const startedAtMonotonic = performance.now();

    try {
      const execution = await this.answers.answerWithContext(input);
      await this.safeRecord(completedRecord({
        channel,
        completedAt: new Date(),
        execution,
        input,
        latencyMs: elapsedMilliseconds(startedAtMonotonic),
        requestId,
        startedAt,
      }));
      return {
        answer: execution.result.answer,
        grounded: execution.result.grounded,
        requestId,
      };
    } catch (error) {
      this.rememberRequestId(error, requestId);
      await this.safeRecord(failedRecord({
        channel,
        completedAt: new Date(),
        error,
        input,
        latencyMs: elapsedMilliseconds(startedAtMonotonic),
        requestId,
        startedAt,
      }));
      throw error;
    }
  }

  requestIdFor(error: unknown): string | undefined {
    return isObject(error) ? this.failedRequestIds.get(error) : undefined;
  }

  private rememberRequestId(error: unknown, requestId: string): void {
    if (isObject(error)) this.failedRequestIds.set(error, requestId);
  }

  private async safeRecord(record: QuestionLogRecord): Promise<void> {
    try {
      await this.questionLog.record(record);
    } catch {
      // Audit persistence is awaited but remains fail-open for the answer path.
    }
  }
}

function isObject(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
