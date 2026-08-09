import type {
  ReviewDecisionOutcome,
  ReviewDetail,
  ReviewItem,
  ReviewPage,
  ReviewStatus,
} from '../../../../shared/contracts/reviews';

export type {
  ReviewDecision,
  ReviewDecisionOutcome,
  ReviewDetail,
  ReviewEvent,
  ReviewItem,
  ReviewPage,
  ReviewQueueEntry,
  ReviewStatus,
} from '../../../../shared/contracts/reviews';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
export type MutationStatus = 'idle' | 'submitting';
export type DecisionMode = 'approve_as_is' | 'approve_edited' | 'reject' | 'needs_changes';

export interface ReviewFilters {
  answerLanguage: string;
  channel: string;
  reviewerId: string;
  status: '' | ReviewStatus;
}

export interface ReviewListRequest extends ReviewFilters {
  limit: number;
  offset: number;
}

export interface ReviewStatusRequest {
  reviewerId: string;
  status: 'in_review' | 'pending';
}

export interface ReviewDecisionRequest {
  correctedAnswer?: string;
  internalNotes?: string;
  outcome: ReviewDecisionOutcome;
  reviewerId: string;
}

export interface ReviewWorkspaceState {
  detail: ReviewDetail | null;
  detailRequestId: number;
  detailStatus: LoadStatus;
  filters: ReviewFilters;
  listRequestId: number;
  listStatus: LoadStatus;
  mutationError: 'conflict' | 'generic' | null;
  mutationStatus: MutationStatus;
  offset: number;
  page: ReviewPage | null;
  selectedId: string | null;
  successKind: 'claim' | 'release' | 'decision' | null;
}

export type ParsedStatusResponse = ReviewItem;
