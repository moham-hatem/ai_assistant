import type { ReviewItem, ReviewStatus } from './reviews.ts';

export const feedbackRatings = ['helpful', 'unhelpful'] as const;
export type FeedbackRating = typeof feedbackRatings[number];

export const feedbackReasons = [
  'inaccurate',
  'unclear',
  'wrong_language',
  'irrelevant_evidence',
  'technical_issue',
  'harmful_or_sensitive',
] as const;
export type FeedbackReason = typeof feedbackReasons[number];

export type FeedbackReviewStatus = ReviewStatus | 'none';

export interface SubmitFeedbackInput {
  comment?: string;
  questionLogId: string;
  rating: FeedbackRating;
  reasons: FeedbackReason[];
  submissionId: string;
}

export interface FeedbackRecord {
  channel: string;
  comment: string | null;
  createdAt: string;
  id: string;
  language: string;
  questionLogId: string;
  rating: FeedbackRating;
  reasons: FeedbackReason[];
  reviewId: string | null;
}

export interface FeedbackSummary extends Omit<FeedbackRecord, 'comment'> {
  hasComment: boolean;
  reviewStatus: FeedbackReviewStatus;
}

export interface FeedbackSubmissionResult {
  feedback: FeedbackRecord;
  review: {
    created: boolean;
    reviewId: string | null;
  };
}

export interface SubmitFeedbackResponse extends FeedbackSubmissionResult {
  requestId: string;
}

export interface FeedbackDetail {
  feedback: FeedbackRecord;
  review: ReviewItem | null;
}

export interface FeedbackListQuery {
  channel?: string;
  language?: string;
  limit: number;
  offset: number;
  rating?: FeedbackRating;
  reason?: FeedbackReason;
  reviewStatus?: FeedbackReviewStatus;
}

export interface FeedbackPage {
  items: FeedbackSummary[];
  limit: number;
  offset: number;
  total: number;
}
