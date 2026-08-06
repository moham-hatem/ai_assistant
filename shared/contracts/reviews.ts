import type { QuestionLogRecord, QuestionLogSummary } from './question-log.ts';

export const reviewStatuses = [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'needs_changes',
] as const;

export type ReviewStatus = typeof reviewStatuses[number];

export const reviewDecisionOutcomes = ['approved', 'rejected', 'needs_changes'] as const;

export type ReviewDecisionOutcome = typeof reviewDecisionOutcomes[number];

export interface ReviewItem {
  assignedReviewerId: string | null;
  claimedAt: string | null;
  createdAt: string;
  decidedAt: string | null;
  id: string;
  questionLogId: string;
  status: ReviewStatus;
  updatedAt: string;
}

export interface ReviewDecision {
  correctedAnswer: string | null;
  createdAt: string;
  id: string;
  internalNotes: string | null;
  outcome: ReviewDecisionOutcome;
  reviewItemId: string;
  reviewerId: string;
}

export interface ReviewQueueEntry {
  item: ReviewItem;
  questionLog: QuestionLogSummary;
}

export interface ReviewDetail {
  decision: ReviewDecision | null;
  item: ReviewItem;
  questionLog: QuestionLogRecord;
}

export interface ReviewListQuery {
  answerLanguage?: string;
  channel?: string;
  limit: number;
  offset: number;
  reviewerId?: string;
  status?: ReviewStatus;
}

export interface ReviewPage {
  items: ReviewQueueEntry[];
  limit: number;
  offset: number;
  total: number;
}
