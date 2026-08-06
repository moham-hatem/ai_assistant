import type { ReviewDecisionOutcome, ReviewStatus } from '../../../shared/contracts/reviews.ts';

const statusTransitions: Readonly<Record<ReviewStatus, readonly ReviewStatus[]>> = {
  approved: [],
  in_review: ['pending'],
  needs_changes: [],
  pending: ['in_review'],
  rejected: [],
};

export class InvalidReviewTransitionError extends Error {
  constructor(from: ReviewStatus, to: ReviewStatus) {
    super(`Review cannot transition from ${from} to ${to}.`);
    this.name = 'InvalidReviewTransitionError';
  }
}

export function assertReviewStatusTransition(from: ReviewStatus, to: ReviewStatus): void {
  if (!statusTransitions[from].includes(to)) throw new InvalidReviewTransitionError(from, to);
}

export function assertDecisionCanBeSaved(status: ReviewStatus): void {
  if (status !== 'pending' && status !== 'in_review') {
    throw new InvalidReviewTransitionError(status, status);
  }
}

export function decisionStatus(outcome: ReviewDecisionOutcome): ReviewStatus {
  return outcome;
}
