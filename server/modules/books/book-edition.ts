import {
  allowedEditionTransitions,
  type EditionStatus,
} from '../../../shared/contracts/books.ts';

export class InvalidEditionTransitionError extends Error {
  readonly from: EditionStatus;
  readonly to: EditionStatus;

  constructor(from: EditionStatus, to: EditionStatus) {
    super(`Edition cannot transition from ${from} to ${to}.`);
    this.name = 'InvalidEditionTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertEditionTransition(from: EditionStatus, to: EditionStatus): void {
  if (!allowedEditionTransitions(from).includes(to)) {
    throw new InvalidEditionTransitionError(from, to);
  }
}

export { allowedEditionTransitions } from '../../../shared/contracts/books.ts';
