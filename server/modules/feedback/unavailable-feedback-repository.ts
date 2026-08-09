import type {
  FeedbackDetail,
  FeedbackListQuery,
  FeedbackPage,
  FeedbackSubmissionResult,
} from '../../../shared/contracts/feedback.ts';
import {
  FeedbackRepositoryUnavailableError,
  type FeedbackRepository,
  type SubmitFeedbackCommand,
} from './feedback-repository.ts';

export class UnavailableFeedbackRepository implements FeedbackRepository {
  private readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }

  async findDetail(_id: string): Promise<FeedbackDetail | undefined> { throw this.error(); }
  async list(_query: FeedbackListQuery): Promise<FeedbackPage> { throw this.error(); }
  async submit(_command: SubmitFeedbackCommand): Promise<FeedbackSubmissionResult> {
    throw this.error();
  }

  private error(): FeedbackRepositoryUnavailableError {
    return new FeedbackRepositoryUnavailableError({ cause: this.cause });
  }
}
