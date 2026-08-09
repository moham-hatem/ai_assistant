import type {
  FeedbackDetail,
  FeedbackListQuery,
  FeedbackPage,
  FeedbackRating,
  FeedbackReason,
  FeedbackSubmissionResult,
} from '../../../shared/contracts/feedback.ts';

export interface SubmitFeedbackCommand {
  comment: string | null;
  createdAt: string;
  escalateImmediately: boolean;
  feedbackId: string;
  payloadDigest: string;
  questionLogId: string;
  rating: FeedbackRating;
  reasons: FeedbackReason[];
  reviewEventId: string;
  reviewId: string;
  submissionDigest: string;
  unhelpfulThreshold: number;
}

export interface FeedbackRepository {
  findDetail(id: string): Promise<FeedbackDetail | undefined>;
  list(query: FeedbackListQuery): Promise<FeedbackPage>;
  submit(command: SubmitFeedbackCommand): Promise<FeedbackSubmissionResult>;
}

export class FeedbackQuestionLogMissingError extends Error {
  constructor() {
    super('The linked question log does not exist.');
    this.name = 'FeedbackQuestionLogMissingError';
  }
}

export class FeedbackIdempotencyConflictError extends Error {
  constructor() {
    super('submissionId was already used for different feedback.');
    this.name = 'FeedbackIdempotencyConflictError';
  }
}

export class FeedbackRepositoryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The local feedback repository is unavailable.', options);
    this.name = 'FeedbackRepositoryUnavailableError';
  }
}
