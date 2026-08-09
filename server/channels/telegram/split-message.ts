export function splitTelegramMessage(text: string, maximumLength = 4096): string[] {
  if (!Number.isInteger(maximumLength) || maximumLength < 1) {
    throw new Error('maximumLength must be a positive integer');
  }
  if (text.length <= maximumLength) return [text];

  const boundaries = graphemeBoundaries(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = furthestBoundary(boundaries, start + maximumLength);
    if (hardEnd <= start) throw new Error('Unable to split Telegram message safely');
    const end = preferredBreak(text, start, hardEnd);
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function graphemeBoundaries(text: string): number[] {
  const boundaries = [0];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const segment of segmenter.segment(text)) boundaries.push(segment.index + segment.segment.length);
  return boundaries;
}

function furthestBoundary(boundaries: number[], maximum: number): number {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle] <= maximum) low = middle + 1;
    else high = middle - 1;
  }
  return boundaries[Math.max(0, high)];
}

function preferredBreak(text: string, start: number, hardEnd: number): number {
  const candidate = text.slice(start, hardEnd);
  for (const marker of ['\n\n', '\n', ' ']) {
    const index = candidate.lastIndexOf(marker);
    if (index > 0) return start + index + marker.length;
  }
  return hardEnd;
}
