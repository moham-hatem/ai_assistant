import type {
  FeedbackRating,
  FeedbackReason,
  FeedbackRecord,
  FeedbackSummary,
} from '../../../shared/contracts/feedback.ts';
import type { ReviewItem, ReviewStatus } from '../../../shared/contracts/reviews.ts';

export interface FeedbackRow {
  answer_language: string;
  channel: string;
  comment: string | null;
  created_at: string;
  id: string;
  payload_digest: string;
  question_log_id: string;
  rating: string;
  reasons: string;
  review_created: number;
  review_item_id: string | null;
  review_status?: string | null;
  submission_digest: string;
}

export interface FeedbackDetailRow extends FeedbackRow {
  r_assigned_reviewer_id: string | null;
  r_claimed_at: string | null;
  r_created_at: string | null;
  r_decided_at: string | null;
  r_question_log_id: string | null;
  r_status: string | null;
  r_updated_at: string | null;
}

export function toFeedbackRecord(row: FeedbackRow): FeedbackRecord {
  return {
    channel: row.channel,
    comment: row.comment,
    createdAt: row.created_at,
    id: row.id,
    language: row.answer_language,
    questionLogId: row.question_log_id,
    rating: row.rating as FeedbackRating,
    reasons: parseReasons(row.reasons),
    reviewId: row.review_item_id,
  };
}

export function toFeedbackSummary(row: FeedbackRow): FeedbackSummary {
  const feedback = toFeedbackRecord(row);
  const { comment: _comment, ...summary } = feedback;
  return {
    ...summary,
    hasComment: row.comment !== null,
    reviewStatus: row.review_status === null || row.review_status === undefined
      ? 'none'
      : row.review_status as ReviewStatus,
  };
}

export function toReviewItem(row: FeedbackDetailRow): ReviewItem | null {
  if (!row.review_item_id || !row.r_status || !row.r_created_at || !row.r_updated_at
    || !row.r_question_log_id) return null;
  return {
    assignedReviewerId: row.r_assigned_reviewer_id,
    claimedAt: row.r_claimed_at,
    createdAt: row.r_created_at,
    decidedAt: row.r_decided_at,
    id: row.review_item_id,
    questionLogId: row.r_question_log_id,
    status: row.r_status as ReviewStatus,
    updatedAt: row.r_updated_at,
  };
}

function parseReasons(value: string): FeedbackReason[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as FeedbackReason[] : [];
}
