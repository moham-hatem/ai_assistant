import type {
  ReviewDecision,
  ReviewEvent,
  ReviewItem,
  ReviewListQuery,
  ReviewPage,
} from '../../../shared/contracts/reviews.ts';
import {
  ReviewRepositoryUnavailableError,
  type ReviewRepository,
  type ReviewTransitionCommand,
  type SaveReviewDecisionCommand,
} from './review-repository.ts';

export class UnavailableReviewRepository implements ReviewRepository {
  private readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }

  async createFromQuestionLog(_item: ReviewItem, _event: ReviewEvent): Promise<void> {
    throw this.error();
  }
  async findDecision(_reviewItemId: string): Promise<ReviewDecision | undefined> { throw this.error(); }
  async findEvents(_reviewItemId: string): Promise<ReviewEvent[]> { throw this.error(); }
  async findItem(_id: string): Promise<ReviewItem | undefined> { throw this.error(); }
  async list(_query: ReviewListQuery): Promise<ReviewPage> { throw this.error(); }
  async saveDecision(_command: SaveReviewDecisionCommand): Promise<ReviewItem> { throw this.error(); }
  async transition(_command: ReviewTransitionCommand): Promise<ReviewItem> { throw this.error(); }

  private error(): ReviewRepositoryUnavailableError {
    return new ReviewRepositoryUnavailableError({ cause: this.cause });
  }
}
