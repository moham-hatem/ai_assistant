import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliExecutionError } from './cli.ts';
import type {
  OcrBatchResult,
  OcrEngine,
  PageRasterizer,
  PdfOcrProcessor,
} from './types.ts';
import { DEFAULT_OCR_LANGUAGES } from './types.ts';

export interface LocalPdfOcrOptions {
  languages?: readonly string[];
  temporaryRoot?: string;
}

export class LocalPdfOcr implements PdfOcrProcessor {
  private readonly engine: OcrEngine;
  private readonly languages: readonly string[];
  private readonly rasterizer: PageRasterizer;
  private readonly temporaryRoot: string;

  constructor(rasterizer: PageRasterizer, engine: OcrEngine, options: LocalPdfOcrOptions = {}) {
    this.engine = engine;
    this.languages = options.languages ?? DEFAULT_OCR_LANGUAGES;
    this.rasterizer = rasterizer;
    this.temporaryRoot = options.temporaryRoot ?? tmpdir();
  }

  async recognize(buffer: Buffer, pageNumbers: readonly number[]): Promise<OcrBatchResult> {
    let directory: string;
    try {
      directory = await mkdtemp(join(this.temporaryRoot, 'islamic-learning-ocr-'));
    } catch {
      return { pages: [], reason: 'failed', status: 'unavailable' };
    }
    const pdfPath = join(directory, 'source.pdf');

    try {
      await writeFile(pdfPath, buffer, { flag: 'wx' });
      const pages = [];
      for (const pageNumber of [...new Set(pageNumbers)].sort((a, b) => a - b)) {
        const rasterized = await this.rasterizer.rasterize({
          outputDirectory: directory,
          pageNumber,
          pdfPath,
        });
        const recognized = await this.engine.recognize({
          imagePath: rasterized.imagePath,
          languages: this.languages,
          pageNumber,
        });
        pages.push({
          ...recognized,
          confidence: clampConfidence(recognized.confidence),
          pageNumber,
        });
      }
      const averageConfidence = pages.length === 0
        ? 0
        : pages.reduce((total, page) => total + page.confidence, 0) / pages.length;
      return { averageConfidence, pages, status: 'completed' };
    } catch (error) {
      return {
        pages: [],
        reason: error instanceof CliExecutionError ? error.reason : 'failed',
        status: 'unavailable',
      };
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
