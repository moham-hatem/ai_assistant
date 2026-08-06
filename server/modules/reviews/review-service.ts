import { randomUUID } from 'node:crypto';
import type {
  ReviewDecision,
  ReviewDecisionOutcome,
  ReviewDetail,
  ReviewItem,
  ReviewListQuery,
  ReviewPage,
  ReviewStatus,
} from '../../../shared/contracts/reviews.ts';
import { AppError } from '../../errors.ts';
import type { QuestionLogRepository } from '../question-log/question-log-repository.ts';
import {
  assertDecisionCanBeSaved,
  assertDecisionFields,
  assertReviewStatusTransition,
  decisionStatus,
  InvalidReviewDecisionError,
  InvalidReviewTransitionError,
  transitionEventType,
} from './review-domain.ts';
import {
  ConcurrentReviewUpdateError,
  DuplicateReviewError,
  QuestionLogMissingError,
  ReviewRepositoryUnavailableError,
  type ReviewRepository,
} from './review-repository.ts';

export interface SaveDecisionInput {
  correctedAnswer?: string;
  internalNotes?: string;
  outcome: ReviewDecisionOutcome;
  reviewerId: string;
}

export class ReviewService {
  private readonly reviews: ReviewRepository;
  private readonly questionLogs: QuestionLogRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    reviews: ReviewRepository,
    questionLogs: QuestionLogRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.reviews = reviews;
    this.questionLogs = questionLogs;
    this.now = now;
    this.createId = createId;
  }

  async createReview(questionLogId: string): Promise<ReviewItem> {
    const at = this.now().toISOString();
    const item: ReviewItem = {
      assignedReviewerId: null,
      claimedAt: null,
      createdAt: at,
      decidedAt: null,
      id: this.createId(),
      questionLogId,
      status: 'pending',
      updatedAt: at,
    };
    await this.call(() => this.reviews.createFromQuestionLog(item, {
      createdAt: at,
      decisionId: null,
      fromStatus: null,
      id: this.createId(),
      reviewerId: null,
      reviewItemId: item.id,
      toStatus: 'pending',
      type: 'created',
    }));
    return item;
  }

  async getReview(id: string): Promise<ReviewDetail> {
    const item = await this.requireItem(id);
    const [questionLog, decision, events] = await Promise.all([
      this.questionLogs.findById(item.questionLogId),
      this.call(() => this.reviews.findDecision(id)),
      this.call(() => this.reviews.findEvents(id)),
    ]);
    if (!questionLog) throw new AppError('QUESTION_LOG_NOT_FOUND', 'Question log not found.', 404);
    return { decision: decision ?? null, events, item, questionLog };
  }

  async listReviews(query: ReviewListQuery): Promise<ReviewPage> {
    return this.call(() => this.reviews.list(query));
  }

  async transitionStatus(
    id: string,
    targetStatus: ReviewStatus,
    reviewerId: string,
  ): Promise<ReviewItem> {
    const item = await this.requireItem(id);
    this.validateTransition(item, targetStatus, reviewerId);
    return this.call(() => this.reviews.transition({
      at: this.now().toISOString(),
      eventId: this.createId(),
      eventType: transitionEventType(item.status, targetStatus),
      expectedStatus: item.status,
      reviewerId,
      reviewItemId: id,
      targetStatus,
    }));
  }

  async saveDecision(id: string, input: SaveDecisionInput): Promise<ReviewDetail> {
    const item = await this.requireItem(id);
    try {
      assertDecisionCanBeSaved(item.status);
    } catch (error) {
      this.invalidTransition(error);
    }
    if (item.assignedReviewerId && item.assignedReviewerId !== input.reviewerId) {
      throw new AppError('REVIEW_CONFLICT', 'Review is assigned to a different reviewer.', 409);
    }
    try {
      assertDecisionFields(input);
    } catch (error) {
      if (error instanceof InvalidReviewDecisionError) {
        throw new AppError('INVALID_REQUEST', error.message, 400, { cause: error });
      }
      throw error;
    }
    const at = this.now().toISOString();
    const decision: ReviewDecision = {
      correctedAnswer: input.correctedAnswer?.trim() || null,
      createdAt: at,
      id: this.createId(),
      internalNotes: input.internalNotes?.trim() || null,
      outcome: input.outcome,
      reviewerId: input.reviewerId,
      reviewItemId: id,
    };
    await this.call(() => this.reviews.saveDecision({
      decision,
      eventId: this.createId(),
      expectedStatus: item.status,
      targetStatus: decisionStatus(input.outcome),
    }));
    return this.getReview(id);
  }

  private async requireItem(id: string): Promise<ReviewItem> {
    const item = await this.call(() => this.reviews.findItem(id));
    if (!item) throw new AppError('REVIEW_NOT_FOUND', 'Review not found.', 404);
    return item;
  }

  private validateTransition(item: ReviewItem, target: ReviewStatus, reviewerId: string): void {
    try {
      assertReviewStatusTransition(item.status, target);
    } catch (error) {
      this.invalidTransition(error);
    }
    if (item.status === 'in_review' && item.assignedReviewerId !== reviewerId) {
      throw new AppError('REVIEW_CONFLICT', 'Review is assigned to a different reviewer.', 409);
    }
  }

  private invalidTransition(error: unknown): never {
    if (error instanceof InvalidReviewTransitionError) {
      throw new AppError('INVALID_REVIEW_TRANSITION', error.message, 409, { cause: error });
    }
    throw error;
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof QuestionLogMissingError) {
        throw new AppError('QUESTION_LOG_NOT_FOUND', error.message, 404, { cause: error });
      }
      if (error instanceof DuplicateReviewError) {
        throw new AppError('DUPLICATE_REVIEW', error.message, 409, { cause: error });
      }
      if (error instanceof ConcurrentReviewUpdateError) {
        throw new AppError('REVIEW_CONFLICT', error.message, 409, { cause: error });
      }
      if (error instanceof ReviewRepositoryUnavailableError) {
        throw new AppError('REVIEWS_UNAVAILABLE', error.message, 503, { cause: error });
      }
      throw error;
    }
  }
}
