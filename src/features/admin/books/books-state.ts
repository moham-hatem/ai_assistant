import { allowedEditionTransitions } from '../../../../shared/contracts/books.ts';
import type { Book, EditionStatus } from './types';

export type OperatorEditionTarget = 'archived' | 'published' | 'ready' | 'rejected';
export type TransitionFailure = 'refresh' | 'transition';

export interface TransitionFailureState {
  detailStatus?: 'error';
  transitionError: TransitionFailure;
}

const operatorTransitions: Readonly<Record<EditionStatus, readonly OperatorEditionTarget[]>> = {
  archived: ['ready'],
  draft: ['rejected', 'archived'],
  processing: ['rejected', 'archived'],
  published: ['archived'],
  ready: ['published', 'rejected', 'archived'],
  rejected: ['archived'],
};

export function canTransitionEdition(from: EditionStatus, to: EditionStatus): boolean {
  return allowedEditionTransitions(from).includes(to);
}

export function operatorEditionTransitions(status: EditionStatus): readonly OperatorEditionTarget[] {
  return operatorTransitions[status].filter((target) => canTransitionEdition(status, target));
}

export function replaceBook(books: readonly Book[], updated: Book): Book[] {
  return books.map((book) => book.id === updated.id ? updated : book);
}

export function isCurrentBookRequest(
  activeBookId: string | null,
  requestedBookId: string,
  activeEditionOffset: number,
  requestedEditionOffset: number,
): boolean {
  return activeBookId === requestedBookId && activeEditionOffset === requestedEditionOffset;
}

export function transitionFailureState(
  failure: TransitionFailure,
  isCurrentRequest: boolean,
): TransitionFailureState | null {
  if (!isCurrentRequest) return null;
  return failure === 'refresh'
    ? { detailStatus: 'error', transitionError: failure }
    : { transitionError: failure };
}

export function nextOffset(offset: number, limit: number, total: number): number {
  return offset + limit < total ? offset + limit : offset;
}

export function previousOffset(offset: number, limit: number): number {
  return Math.max(0, offset - limit);
}

export function visibleRange(offset: number, itemCount: number) {
  return itemCount === 0 ? { start: 0, end: 0 } : { start: offset + 1, end: offset + itemCount };
}
