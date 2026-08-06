import type {
  ReviewDecisionOutcome,
  ReviewEventType,
  ReviewStatus,
} from '../../../shared/contracts/reviews.ts';

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

export class InvalidReviewDecisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReviewDecisionError';
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

export function transitionEventType(from: ReviewStatus, to: ReviewStatus): ReviewEventType {
  if (from === 'pending' && to === 'in_review') return 'claimed';
  if (from === 'in_review' && to === 'pending') return 'released';
  return 'status_changed';
}

export function assertDecisionFields(input: {
  correctedAnswer?: string;
  internalNotes?: string;
  outcome: ReviewDecisionOutcome;
}): void {
  const hasCorrection = Boolean(input.correctedAnswer?.trim());
  const hasNotes = Boolean(input.internalNotes?.trim());
  if (input.outcome === 'rejected' && input.correctedAnswer !== undefined) {
    invalid('rejected does not accept correctedAnswer.');
  }
  if (input.outcome === 'needs_changes') {
    if (input.correctedAnswer !== undefined) invalid('needs_changes does not accept correctedAnswer.');
    if (!hasNotes) invalid('needs_changes requires internalNotes.');
  }
  if (input.outcome === 'approved' && input.correctedAnswer !== undefined && !hasCorrection) {
    invalid('correctedAnswer must not be empty.');
  }
}

function invalid(message: string): never {
  throw new InvalidReviewDecisionError(message);
}
