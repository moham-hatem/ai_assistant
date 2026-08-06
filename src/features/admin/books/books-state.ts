import { allowedEditionTransitions } from '../../../../shared/contracts/books.ts';
import type { BookEdition, EditionStatus } from './types';

export function canTransitionEdition(from: EditionStatus, to: EditionStatus): boolean {
  return allowedEditionTransitions(from).includes(to);
}

export function replaceEdition(
  editions: readonly BookEdition[],
  updated: BookEdition,
): BookEdition[] {
  return editions.map((edition) => edition.id === updated.id ? updated : edition);
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
