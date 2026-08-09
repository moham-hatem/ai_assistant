import type { DocumentExtractor } from '../types.ts';
import { LocalPdfOcr } from '../ocr/local-pdf-ocr.ts';
import { TextQualityOcrPolicy } from '../ocr/page-policy.ts';
import { HybridPdfPageProcessor } from '../ocr/pdf-page-processor.ts';
import {
  PdfOcrRequiredError,
  type PdfExtractionResult,
} from '../ocr/pdf-extraction-result.ts';
import { PdftoppmRasterizer } from '../ocr/pdftoppm-rasterizer.ts';
import { TesseractOcrEngine } from '../ocr/tesseract-engine.ts';
import type { PageOcrDecisionPolicy, PdfOcrProcessor } from '../ocr/types.ts';
import { PdfJsPageReader, type PdfPageReader } from './pdf-reader.ts';

export { PdfOcrRequiredError } from '../ocr/pdf-extraction-result.ts';
export type { PdfExtractionResult, PdfPageExtractionResult } from '../ocr/pdf-extraction-result.ts';

export interface PdfExtractorOptions {
  ocr?: PdfOcrProcessor;
  pageReader?: PdfPageReader;
  policy?: PageOcrDecisionPolicy;
}

export class PdfExtractor implements DocumentExtractor {
  private readonly pageProcessor: HybridPdfPageProcessor;
  private readonly pageReader: PdfPageReader;

  constructor(options: PdfExtractorOptions = {}) {
    const ocr = options.ocr ?? new LocalPdfOcr(
      new PdftoppmRasterizer(),
      new TesseractOcrEngine(),
    );
    this.pageProcessor = new HybridPdfPageProcessor(
      ocr,
      options.policy ?? new TextQualityOcrPolicy(),
    );
    this.pageReader = options.pageReader ?? new PdfJsPageReader();
  }

  async extract(buffer: Buffer): Promise<string> {
    const result = await this.extractDetailed(buffer);
    if (result.status === 'needs_ocr') throw new PdfOcrRequiredError(result);
    return result.text;
  }

  async extractDetailed(buffer: Buffer): Promise<PdfExtractionResult> {
    return this.pageProcessor.process(buffer, await this.pageReader.read(buffer));
  }
}
