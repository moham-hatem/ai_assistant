import type {
  QuestionLogListQuery,
  QuestionLogPage,
  QuestionLogRecord,
} from '../../../shared/contracts/question-log.ts';

export interface QuestionLogRepository {
  findById(id: string): Promise<QuestionLogRecord | undefined>;
  list(query: QuestionLogListQuery): Promise<QuestionLogPage>;
  save(record: QuestionLogRecord): Promise<void>;
}
