import type { EditionStatus } from '../../../shared/contracts/books.ts';

const transitions: Readonly<Record<EditionStatus, readonly EditionStatus[]>> = {
  archived: ['ready'],
  draft: ['processing', 'rejected', 'archived'],
  processing: ['ready', 'rejected', 'archived'],
  published: ['archived'],
  ready: ['published', 'rejected', 'archived'],
  rejected: ['draft', 'archived'],
};

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
  if (!transitions[from].includes(to)) throw new InvalidEditionTransitionError(from, to);
}

export function allowedEditionTransitions(status: EditionStatus): readonly EditionStatus[] {
  return transitions[status];
}
