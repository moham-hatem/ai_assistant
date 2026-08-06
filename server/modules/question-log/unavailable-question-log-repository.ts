import type {
  QuestionLogListQuery,
  QuestionLogPage,
  QuestionLogRecord,
} from '../../../shared/contracts/question-log.ts';
import type { QuestionLogRepository } from './question-log-repository.ts';

export class UnavailableQuestionLogRepository implements QuestionLogRepository {
  private readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }

  async save(_record: QuestionLogRecord): Promise<void> {
    throw this.error();
  }

  async list(_query: QuestionLogListQuery): Promise<QuestionLogPage> {
    throw this.error();
  }

  async findById(_id: string): Promise<QuestionLogRecord | undefined> {
    throw this.error();
  }

  private error(): Error {
    return new Error('The local question log is unavailable.', { cause: this.cause });
  }
}
