import type {
  ApprovedAnswer,
  ApprovedAnswerLookup,
} from '../../../shared/contracts/approved-answers.ts';

export interface ApprovedAnswerApproval {
  answer: string;
  answerLanguage: string;
  approvedAt: string;
  evidenceReferences: string[];
  id: string;
  normalizedQuestion: string;
  question: string;
  reviewerId: string;
  sourceDecisionId: string;
  sourceReviewItemId: string;
}
export interface ApprovedAnswerRepository {
  findActiveExact(query: ApprovedAnswerLookup): Promise<ApprovedAnswer | undefined>;
}

export class ApprovedAnswerRepositoryUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('The local approved-answer repository is unavailable.', options);
    this.name = 'ApprovedAnswerRepositoryUnavailableError';
  }
}
