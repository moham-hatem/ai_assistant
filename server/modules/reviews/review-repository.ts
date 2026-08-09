import type {
  ReviewDecision,
  ReviewEvent,
  ReviewEventType,
  ReviewItem,
  ReviewListQuery,
  ReviewPage,
  ReviewStatus,
} from '../../../shared/contracts/reviews.ts';
import type { ApprovedAnswerApproval } from '../approved-answers/approved-answer-repository.ts';

export interface ReviewTransitionCommand {
  at: string;
  expectedStatus: ReviewStatus;
  reviewerId: string;
  eventId: string;
  eventType: ReviewEventType;
  reviewItemId: string;
  targetStatus: ReviewStatus;
}

export interface SaveReviewDecisionCommand {
  approvedAnswer?: ApprovedAnswerApproval;
  decision: ReviewDecision;
  eventId: string;
  expectedStatus: ReviewStatus;
  targetStatus: ReviewStatus;
}

export interface ReviewRepository {
  createFromQuestionLog(item: ReviewItem, event: ReviewEvent): Promise<void>;
  findDecision(reviewItemId: string): Promise<ReviewDecision | undefined>;
  findEvents(reviewItemId: string): Promise<ReviewEvent[]>;
  findItem(id: string): Promise<ReviewItem | undefined>;
  list(query: ReviewListQuery): Promise<ReviewPage>;
  saveDecision(command: SaveReviewDecisionCommand): Promise<ReviewItem>;
  transition(command: ReviewTransitionCommand): Promise<ReviewItem>;
}

export class QuestionLogMissingError extends Error {
  constructor() {
    super('The linked question log does not exist.');
    this.name = 'QuestionLogMissingError';
  }
}

export class DuplicateReviewError extends Error {
  constructor() {
    super('A review already exists for this question log.');
    this.name = 'DuplicateReviewError';
  }
}

export class ConcurrentReviewUpdateError extends Error {
  constructor() {
    super('The review changed before the operation completed.');
    this.name = 'ConcurrentReviewUpdateError';
  }
}

export class ReviewRepositoryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The local review repository is unavailable.', options);
    this.name = 'ReviewRepositoryUnavailableError';
  }
}
