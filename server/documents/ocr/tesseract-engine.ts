import { CliExecutionError, ExecFileCliRunner, type CliRunner } from './cli.ts';
import type { OcrEngine, OcrPageResult, RecognizePageInput } from './types.ts';

export interface TesseractOcrEngineOptions {
  executable?: string;
  maxOutputBytes?: number;
  timeoutMs?: number;
}

export class TesseractOcrEngine implements OcrEngine {
  private readonly executable: string;
  private readonly maxOutputBytes: number;
  private readonly runner: CliRunner;
  private readonly timeoutMs: number;

  constructor(options: TesseractOcrEngineOptions = {}, runner: CliRunner = new ExecFileCliRunner()) {
    this.executable = options.executable ?? 'tesseract';
    this.maxOutputBytes = options.maxOutputBytes ?? 5 * 1024 * 1024;
    this.runner = runner;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async recognize(input: RecognizePageInput): Promise<OcrPageResult> {
    const result = await this.runner.run(this.executable, [
      input.imagePath,
      'stdout',
      '-l', input.languages.join('+'),
      'tsv',
    ], { maxOutputBytes: this.maxOutputBytes, timeoutMs: this.timeoutMs });
    const parsed = parseTesseractTsv(result.stdout);
    return { ...parsed, pageNumber: input.pageNumber };
  }
}

interface TsvWord {
  confidence: number;
  lineKey: string;
  text: string;
}

export function parseTesseractTsv(tsv: string): { confidence: number; text: string } {
  const lines = tsv.replace(/^\uFEFF/u, '').split(/\r?\n/u);
  if (lines.length === 0) throw new CliExecutionError('failed');
  const header = lines[0]!.split('\t');
  const indices = {
    block: header.indexOf('block_num'),
    confidence: header.indexOf('conf'),
    line: header.indexOf('line_num'),
    page: header.indexOf('page_num'),
    paragraph: header.indexOf('par_num'),
    text: header.indexOf('text'),
  };
  if (Object.values(indices).some((index) => index < 0)) throw new CliExecutionError('failed');

  const words: TsvWord[] = [];
  for (const row of lines.slice(1)) {
    if (!row) continue;
    const columns = row.split('\t');
    const text = columns[indices.text]?.trim() ?? '';
    const confidence = Number(columns[indices.confidence]);
    if (!text || !Number.isFinite(confidence) || confidence < 0) continue;
    words.push({
      confidence: clamp(confidence / 100),
      lineKey: [indices.page, indices.block, indices.paragraph, indices.line]
        .map((index) => columns[index] ?? '')
        .join(':'),
      text,
    });
  }

  const textLines: string[] = [];
  let previousLineKey: string | undefined;
  for (const word of words) {
    const previous = textLines.at(-1);
    if (previous !== undefined && previousLineKey === word.lineKey) textLines[textLines.length - 1] = `${previous} ${word.text}`;
    else textLines.push(word.text);
    previousLineKey = word.lineKey;
  }
  const confidence = words.length === 0
    ? 0
    : words.reduce((total, word) => total + word.confidence, 0) / words.length;
  return { confidence, text: textLines.join('\n') };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
