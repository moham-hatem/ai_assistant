// Channels are operational identifiers and remain open for future integrations.
export type QuestionLogChannel = string;

// Audit storage is intentionally independent from the languages enabled by any current channel.
export type QuestionLogAnswerLanguage = string;

export type QuestionLogStatus = 'answered' | 'declined' | 'failed';

export type EvidenceSufficiency = 'sufficient' | 'insufficient' | 'unknown';

export interface QuestionLogRecord {
  answer: string | null;
  answerLanguage: QuestionLogAnswerLanguage;
  apology: string | null;
  channel: QuestionLogChannel;
  completedAt: string;
  evidenceReferences: string[];
  grounded: boolean | null;
  id: string;
  latencyMs: number;
  model: string | null;
  provider: string | null;
  question: string;
  startedAt: string;
  status: QuestionLogStatus;
  sufficiency: EvidenceSufficiency;
}

export type QuestionLogSummary = Omit<
  QuestionLogRecord,
  'answer' | 'apology' | 'evidenceReferences'
>;

export interface QuestionLogListQuery {
  limit: number;
  offset: number;
}

export interface QuestionLogPage {
  items: QuestionLogSummary[];
  limit: number;
  offset: number;
  total: number;
}
