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
import { normalizeApprovedQuestion } from '../approved-answers/approved-answer-domain.ts';
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
import type { SecurityAuditContext } from '../security-audit/domain.ts';
import type { SecurityAuditService } from '../security-audit/service.ts';

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
  private readonly audit?: SecurityAuditService;

  constructor(
    reviews: ReviewRepository,
    questionLogs: QuestionLogRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
    audit?: SecurityAuditService,
  ) {
    this.reviews = reviews;
    this.questionLogs = questionLogs;
    this.now = now;
    this.createId = createId;
    this.audit = audit;
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
    auditContext?: SecurityAuditContext,
  ): Promise<ReviewItem> {
    const item = await this.requireItem(id);
    this.validateTransition(item, targetStatus, reviewerId);
    const at = this.now().toISOString();
    const audit = auditContext && this.audit ? {
      action: 'review.status_changed' as const,
      actorUserId: auditContext.actorUserId,
      category: 'reviews' as const,
      id: this.createId(),
      metadata: { fromStatus: item.status, toStatus: targetStatus },
      outcome: 'success' as const,
      requestId: auditContext.requestId,
      subjectId: id,
      subjectType: 'review_item' as const,
      timestamp: at,
    } : undefined;
    const result = await this.call(() => this.reviews.transition({
      at,
      audit,
      eventId: this.createId(),
      eventType: transitionEventType(item.status, targetStatus),
      expectedStatus: item.status,
      reviewerId,
      reviewItemId: id,
      targetStatus,
    }));
    if (audit) await this.flushAudit();
    return result;
  }

  async saveDecision(id: string, input: SaveDecisionInput, auditContext?: SecurityAuditContext): Promise<ReviewDetail> {
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
    const approvedAnswer = input.outcome === 'approved'
      ? await this.buildApprovedAnswer(item.questionLogId, decision)
      : undefined;
    const audit = auditContext && this.audit ? {
      action: 'review.decision_recorded' as const,
      actorUserId: auditContext.actorUserId,
      category: 'reviews' as const,
      id: this.createId(),
      metadata: { decisionOutcome: input.outcome, hasCorrection: decision.correctedAnswer !== null },
      outcome: 'success' as const,
      requestId: auditContext.requestId,
      subjectId: id,
      subjectType: 'review_item' as const,
      timestamp: at,
    } : undefined;
    await this.call(() => this.reviews.saveDecision({
      approvedAnswer,
      audit,
      decision,
      eventId: this.createId(),
      expectedStatus: item.status,
      targetStatus: decisionStatus(input.outcome),
    }));
    if (audit) await this.flushAudit();
    return this.getReview(id);
  }

  private async buildApprovedAnswer(questionLogId: string, decision: ReviewDecision) {
    const questionLog = await this.questionLogs.findById(questionLogId);
    if (!questionLog) {
      throw new AppError('QUESTION_LOG_NOT_FOUND', 'Question log not found.', 404);
    }
    const answer = decision.correctedAnswer ?? questionLog.answer;
    if (!answer?.trim()) {
      throw new AppError(
        'INVALID_REQUEST',
        'An approved review requires an original answer or correctedAnswer.',
        400,
      );
    }
    if (questionLog.evidenceReferences.length === 0) {
      throw new AppError(
        'INVALID_REQUEST',
        'An approved review requires at least one evidence reference.',
        400,
      );
    }
    return {
      answer: answer.trim(),
      answerLanguage: questionLog.answerLanguage,
      approvedAt: decision.createdAt,
      evidenceReferences: [...questionLog.evidenceReferences],
      id: this.createId(),
      normalizedQuestion: normalizeApprovedQuestion(questionLog.question),
      question: questionLog.question,
      reviewerId: decision.reviewerId,
      sourceDecisionId: decision.id,
      sourceReviewItemId: decision.reviewItemId,
    };
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

  private async flushAudit(): Promise<void> {
    if (this.audit && this.reviews.flushSecurityAuditOutbox) {
      await this.reviews.flushSecurityAuditOutbox(this.audit);
    }
  }
}
