import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import type { QuestionLogRepository } from './question-log-repository.ts';

export type QuestionLogFailureReporter = (error: unknown) => void;

export interface QuestionLogWriter {
  record(record: QuestionLogRecord): Promise<boolean>;
}

export class QuestionLogService implements QuestionLogWriter {
  private readonly repository: QuestionLogRepository;
  private readonly reportFailure: QuestionLogFailureReporter;

  constructor(
    repository: QuestionLogRepository,
    reportFailure: QuestionLogFailureReporter = defaultFailureReporter,
  ) {
    this.repository = repository;
    this.reportFailure = reportFailure;
  }

  async record(record: QuestionLogRecord): Promise<boolean> {
    try {
      await this.repository.save(record);
      return true;
    } catch (error) {
      try {
        this.reportFailure(error);
      } catch {
        // Audit reporting is deliberately isolated from the user-facing answer path.
      }
      return false;
    }
  }
}

function defaultFailureReporter(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.warn(`Question audit log unavailable: ${detail}`);
}
