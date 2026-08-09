import { randomUUID } from 'node:crypto';
import type {
  FeedbackDetail,
  FeedbackListQuery,
  FeedbackPage,
  FeedbackSubmissionResult,
  SubmitFeedbackInput,
} from '../../../shared/contracts/feedback.ts';
import { AppError } from '../../errors.ts';
import { digestFeedbackPayload, digestSubmissionId } from './feedback-digest.ts';
import { isHighRiskFeedback, UNHELPFUL_REVIEW_THRESHOLD } from './feedback-domain.ts';
import {
  FeedbackIdempotencyConflictError,
  FeedbackQuestionLogMissingError,
  FeedbackRepositoryUnavailableError,
  type FeedbackRepository,
} from './feedback-repository.ts';

export class FeedbackService {
  private readonly repository: FeedbackRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    repository: FeedbackRepository,
    now: () => Date = () => new Date(),
    createId: () => string = randomUUID,
  ) {
    this.repository = repository;
    this.now = now;
    this.createId = createId;
  }

  async submit(input: SubmitFeedbackInput): Promise<FeedbackSubmissionResult> {
    const { submissionId, ...payload } = input;
    return this.call(() => this.repository.submit({
      comment: input.comment ?? null,
      createdAt: this.now().toISOString(),
      escalateImmediately: isHighRiskFeedback(input.reasons),
      feedbackId: this.createId(),
      payloadDigest: digestFeedbackPayload(payload),
      questionLogId: input.questionLogId,
      rating: input.rating,
      reasons: input.reasons,
      reviewEventId: this.createId(),
      reviewId: this.createId(),
      submissionDigest: digestSubmissionId(submissionId),
      unhelpfulThreshold: UNHELPFUL_REVIEW_THRESHOLD,
    }));
  }

  async getDetail(id: string): Promise<FeedbackDetail> {
    const detail = await this.call(() => this.repository.findDetail(id));
    if (!detail) throw new AppError('FEEDBACK_NOT_FOUND', 'Feedback not found.', 404);
    return detail;
  }

  async list(query: FeedbackListQuery): Promise<FeedbackPage> {
    return this.call(() => this.repository.list(query));
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof FeedbackQuestionLogMissingError) {
        throw new AppError('QUESTION_LOG_NOT_FOUND', error.message, 404, { cause: error });
      }
      if (error instanceof FeedbackIdempotencyConflictError) {
        throw new AppError('FEEDBACK_CONFLICT', error.message, 409, { cause: error });
      }
      if (error instanceof FeedbackRepositoryUnavailableError) {
        throw new AppError('FEEDBACK_UNAVAILABLE', error.message, 503, { cause: error });
      }
      throw error;
    }
  }
}
