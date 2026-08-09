export function nextReviewOffset(offset: number, limit: number, total: number): number {
  return offset + limit < total ? offset + limit : offset;
}

export function previousReviewOffset(offset: number, limit: number): number {
  return Math.max(0, offset - limit);
}

export function reviewRange(offset: number, itemCount: number): { end: number; start: number } {
  return itemCount === 0 ? { end: 0, start: 0 } : { end: offset + itemCount, start: offset + 1 };
}
