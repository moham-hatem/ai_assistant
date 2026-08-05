interface PdfTextItemLike {
  dir?: string;
  height?: number;
  str: string;
  transform: ArrayLike<number>;
  width?: number;
}

interface PositionedText {
  centerX: number;
  height: number;
  id: number;
  text: string;
  width: number;
  x: number;
  y: number;
}

interface TextLine {
  bottom: number;
  centerX: number;
  height: number;
  items: PositionedText[];
  left: number;
  right: number;
  text: string;
  top: number;
  y: number;
}

interface NumberedStep {
  itemIds: number[];
  label: string;
  number: number;
  score: number;
}

interface NumberedSequence {
  itemIds: Set<number>;
  steps: NumberedStep[];
}

export interface PdfPageLayout {
  height: number;
  pageNumber: number;
  width: number;
}

const MAX_STEP_NUMBER = 30;

export function extractLayoutAwarePage(
  sourceItems: readonly PdfTextItemLike[],
  layout: PdfPageLayout,
): string {
  const items = positionItems(sourceItems);
  if (items.length === 0) return '';

  const sequence = extractNumberedSequence(items, layout);
  const readingOrder = orderForReading(
    items.filter((item) => !sequence.itemIds.has(item.id)),
    layout,
  );
  const sections = [`[PDF page ${layout.pageNumber}]`];

  if (sequence.steps.length >= 3) {
    sections.push(`Numbered sequence:\n${sequence.steps.map((step) => `${step.number}. ${step.label}`).join('\n')}`);
  }

  sections.push(readingOrder.map((line) => line.text).join('\n'));
  return sections.filter(Boolean).join('\n\n').trim();
}

function positionItems(sourceItems: readonly PdfTextItemLike[]): PositionedText[] {
  return sourceItems.flatMap((item, id) => {
    const text = cleanText(item.str);
    if (!text || item.transform.length < 6) return [];

    const x = numberAt(item.transform, 4);
    const y = numberAt(item.transform, 5);
    const width = Math.max(item.width ?? 0, text.length * inferredHeight(item) * 0.25);
    const height = inferredHeight(item);
    return [{ centerX: x + width / 2, height, id, text, width, x, y }];
  });
}

function inferredHeight(item: PdfTextItemLike): number {
  const explicit = Math.abs(item.height ?? 0);
  if (explicit > 0) return explicit;
  const verticalScale = Math.hypot(numberAt(item.transform, 2), numberAt(item.transform, 3));
  return Math.max(verticalScale, 1);
}

function numberAt(values: ArrayLike<number>, index: number): number {
  const value = Number(values[index]);
  return Number.isFinite(value) ? value : 0;
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function orderForReading(items: PositionedText[], layout: PdfPageLayout): TextLine[] {
  const isSpread = layout.width / Math.max(layout.height, 1) >= 1.45;
  if (!isSpread) return buildLines(items);

  const middle = layout.width / 2;
  const left = items.filter((item) => item.centerX < middle);
  const right = items.filter((item) => item.centerX >= middle);
  return [...buildLines(left), ...buildLines(right)];
}

function buildLines(items: PositionedText[]): TextLine[] {
  const rows: PositionedText[][] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x || a.id - b.id);

  for (const item of sorted) {
    const row = rows.find((candidate) => sameBaseline(candidate, item));
    if (row) row.push(item);
    else rows.push([item]);
  }

  return rows
    .sort((a, b) => averageY(b) - averageY(a))
    .flatMap(splitRow)
    .map(toTextLine);
}

function sameBaseline(row: PositionedText[], item: PositionedText): boolean {
  const reference = row[0];
  const tolerance = Math.max(2.5, Math.min(reference.height, item.height) * 0.45);
  return Math.abs(reference.y - item.y) <= tolerance;
}

function averageY(items: PositionedText[]): number {
  return items.reduce((total, item) => total + item.y, 0) / items.length;
}

function splitRow(row: PositionedText[]): PositionedText[][] {
  const sorted = [...row].sort((a, b) => a.x - b.x || a.id - b.id);
  const segments: PositionedText[][] = [];

  for (const item of sorted) {
    const segment = segments.at(-1);
    const previous = segment?.at(-1);
    const gap = previous ? item.x - (previous.x + previous.width) : 0;
    const threshold = previous ? Math.max(28, previous.height * 3, item.height * 3) : 0;
    if (!segment || gap > threshold) segments.push([item]);
    else segment.push(item);
  }

  return segments;
}

function toTextLine(items: PositionedText[]): TextLine {
  const sorted = [...items].sort((a, b) => a.x - b.x || a.id - b.id);
  const left = Math.min(...sorted.map((item) => item.x));
  const right = Math.max(...sorted.map((item) => item.x + item.width));
  const y = averageY(sorted);
  const height = Math.max(...sorted.map((item) => item.height));
  return {
    bottom: y - height,
    centerX: (left + right) / 2,
    height,
    items: sorted,
    left,
    right,
    text: joinText(sorted.map((item) => item.text)),
    top: y,
    y,
  };
}

function joinText(parts: string[]): string {
  return parts
    .join(' ')
    .replace(/\s+([,.;:!?،؛؟%)\]}])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumberedSequence(items: PositionedText[], layout: PdfPageLayout): NumberedSequence {
  const lines = buildLines(items);
  const numberedLines = lines.flatMap((line) => {
    const number = parseStandaloneNumber(line.text);
    return number === undefined ? [] : [{ line, number }];
  });
  const labelLines = lines.filter((line) => parseStandaloneNumber(line.text) === undefined);
  const bestByNumber = new Map<number, NumberedStep>();

  for (const candidate of numberedLines) {
    if (candidate.line.y < layout.height * 0.08) continue;
    const nextNumber = numberedLines
      .filter((other) => Math.abs(other.line.y - candidate.line.y) <= Math.max(4, candidate.line.height))
      .filter((other) => other.line.centerX > candidate.line.centerX)
      .sort((a, b) => a.line.centerX - b.line.centerX)[0];
    const match = nearestLabel(candidate.line, nextNumber?.line, labelLines, layout);
    if (!match) continue;

    const label = extendLabel(match.line, labelLines, layout.width);
    const current = bestByNumber.get(candidate.number);
    const step = {
      itemIds: [
        ...candidate.line.items.map((item) => item.id),
        ...label.lines.flatMap((line) => line.items.map((item) => item.id)),
      ],
      label: label.text,
      number: candidate.number,
      score: match.score,
    };
    if (!current || step.score < current.score) bestByNumber.set(candidate.number, step);
  }

  const steps = longestConsecutiveRun([...bestByNumber.values()]);
  return { itemIds: new Set(steps.flatMap((step) => step.itemIds)), steps };
}

function parseStandaloneNumber(text: string): number | undefined {
  const normalized = text
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[.)\-:]+$/g, '')
    .trim();
  if (!/^\d{1,2}$/.test(normalized)) return undefined;
  const value = Number.parseInt(normalized, 10);
  return value >= 1 && value <= MAX_STEP_NUMBER ? value : undefined;
}

function nearestLabel(
  numberLine: TextLine,
  nextNumberLine: TextLine | undefined,
  labels: TextLine[],
  layout: PdfPageLayout,
): { line: TextLine; score: number } | undefined {
  const maximumVerticalGap = layout.height * 0.34;
  const maximumHorizontalGap = Math.max(72, layout.width * 0.11);
  let best: { line: TextLine; score: number } | undefined;

  for (const line of labels) {
    const verticalGap = numberLine.y - line.y;
    if (verticalGap < Math.max(12, numberLine.height) || verticalGap > maximumVerticalGap) continue;
    if (line.centerX < numberLine.centerX - 20) continue;
    if (nextNumberLine && line.centerX >= nextNumberLine.centerX) continue;

    const horizontalGap = distanceToRange(numberLine.centerX, line.left, line.right);
    if (horizontalGap > maximumHorizontalGap) continue;

    const score = verticalGap + horizontalGap * 0.5;
    if (!best || score < best.score) best = { line, score };
  }

  return best;
}

function distanceToRange(value: number, start: number, end: number): number {
  if (value < start) return start - value;
  if (value > end) return value - end;
  return 0;
}

function extendLabel(
  start: TextLine,
  labels: TextLine[],
  pageWidth: number,
): { lines: TextLine[]; text: string } {
  const selected = [start];
  let current = start;

  for (let index = 0; index < 2; index += 1) {
    const next = labels
      .filter((line) => line.y < current.y - 2)
      .filter((line) => current.y - line.y <= Math.max(28, current.height * 2.5))
      .filter((line) => horizontalDistance(current, line) <= Math.max(18, pageWidth * 0.025))
      .filter((line) => Math.abs(current.centerX - line.centerX) <= Math.max(50, pageWidth * 0.06))
      .sort((a, b) => current.y - a.y - (current.y - b.y))[0];
    if (!next) break;
    selected.push(next);
    current = next;
  }

  return { lines: selected, text: selected.map((line) => line.text).join(' ') };
}

function horizontalDistance(first: TextLine, second: TextLine): number {
  if (first.right < second.left) return second.left - first.right;
  if (second.right < first.left) return first.left - second.right;
  return 0;
}

function longestConsecutiveRun(steps: NumberedStep[]): NumberedStep[] {
  const sorted = [...steps].sort((a, b) => a.number - b.number);
  let best: NumberedStep[] = [];
  let current: NumberedStep[] = [];

  for (const step of sorted) {
    if (current.length === 0 || step.number === current.at(-1)!.number + 1) current.push(step);
    else current = [step];
    if (current.length > best.length) best = [...current];
  }

  return best.length >= 3 ? best : [];
}
