export type ApprovedAnswerStatus = 'active' | 'retired';

export interface ApprovedAnswer {
  answer: string;
  answerLanguage: string;
  approvedAt: string;
  createdAt: string;
  evidenceReferences: string[];
  id: string;
  normalizedQuestion: string;
  question: string;
  retiredAt: string | null;
  reviewerId: string;
  sourceDecisionId: string;
  sourceReviewItemId: string;
  status: ApprovedAnswerStatus;
  supersededByAnswerId: string | null;
  version: number;
}
export interface ApprovedAnswerLookup {
  answerLanguage: string;
  normalizedQuestion: string;
}
