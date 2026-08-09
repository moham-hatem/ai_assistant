export const feedbackReasons = [
  'inaccurate',
  'unclear',
  'wrong_language',
  'irrelevant_evidence',
  'technical_issue',
  'harmful_or_sensitive',
] as const;

export type FeedbackReason = typeof feedbackReasons[number];
export type FeedbackRating = 'helpful' | 'unhelpful';

export interface FeedbackRequest {
  questionLogId: string;
  rating: FeedbackRating;
  reasons: FeedbackReason[];
  comment?: string;
  submissionId: string;
}

export interface FeedbackResponse {
  feedback: Record<string, unknown>;
  requestId: string;
  review: {
    created: boolean;
    reviewId: string | null;
  };
}
