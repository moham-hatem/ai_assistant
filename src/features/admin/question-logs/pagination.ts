export function nextOffset(offset: number, limit: number, total: number): number {
  return Math.min(offset + limit, Math.max(0, Math.ceil(total / limit) * limit - limit));
}

export function previousOffset(offset: number, limit: number): number {
  return Math.max(0, offset - limit);
}

export function visibleRange(offset: number, itemCount: number): { end: number; start: number } {
  if (itemCount === 0) return { start: 0, end: 0 };
  return { start: offset + 1, end: offset + itemCount };
}
