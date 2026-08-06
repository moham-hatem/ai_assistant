import type {
  QuestionLogPage,
  QuestionLogRecord,
  QuestionLogSummary,
} from '../../../../shared/contracts/question-log';

export type { QuestionLogPage, QuestionLogRecord, QuestionLogSummary };

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
