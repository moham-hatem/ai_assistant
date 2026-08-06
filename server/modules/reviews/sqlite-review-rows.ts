import type {
  ReviewDecision,
  ReviewDecisionOutcome,
  ReviewItem,
  ReviewQueueEntry,
  ReviewStatus,
} from '../../../shared/contracts/reviews.ts';
import type {
  EvidenceSufficiency,
  QuestionLogStatus,
} from '../../../shared/contracts/question-log.ts';

export interface ReviewItemRow {
  assigned_reviewer_id: string | null;
  claimed_at: string | null;
  created_at: string;
  decided_at: string | null;
  id: string;
  question_log_id: string;
  status: string;
  updated_at: string;
}

export interface ReviewDecisionRow {
  corrected_answer: string | null;
  created_at: string;
  id: string;
  internal_notes: string | null;
  outcome: string;
  review_item_id: string;
  reviewer_id: string;
}

export interface ReviewQueueRow extends ReviewItemRow {
  q_answer_language: string;
  q_channel: string;
  q_completed_at: string;
  q_grounded: number | null;
  q_id: string;
  q_latency_ms: number;
  q_model: string | null;
  q_provider: string | null;
  q_question: string;
  q_started_at: string;
  q_status: string;
  q_sufficiency: string;
}

export function toReviewItem(row: ReviewItemRow): ReviewItem {
  return {
    assignedReviewerId: row.assigned_reviewer_id,
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    id: row.id,
    questionLogId: row.question_log_id,
    status: row.status as ReviewStatus,
    updatedAt: row.updated_at,
  };
}

export function toReviewDecision(row: ReviewDecisionRow): ReviewDecision {
  return {
    correctedAnswer: row.corrected_answer,
    createdAt: row.created_at,
    id: row.id,
    internalNotes: row.internal_notes,
    outcome: row.outcome as ReviewDecisionOutcome,
    reviewerId: row.reviewer_id,
    reviewItemId: row.review_item_id,
  };
}

export function toQueueEntry(row: ReviewQueueRow): ReviewQueueEntry {
  return {
    item: toReviewItem(row),
    questionLog: {
      answerLanguage: row.q_answer_language,
      channel: row.q_channel,
      completedAt: row.q_completed_at,
      grounded: row.q_grounded === null ? null : row.q_grounded === 1,
      id: row.q_id,
      latencyMs: row.q_latency_ms,
      model: row.q_model,
      provider: row.q_provider,
      question: row.q_question,
      startedAt: row.q_started_at,
      status: row.q_status as QuestionLogStatus,
      sufficiency: row.q_sufficiency as EvidenceSufficiency,
    },
  };
}
