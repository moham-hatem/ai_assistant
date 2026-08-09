import type { NativePdfPage } from '../extractors/pdf-reader.ts';
import type { PageOcrDecisionPolicy, PdfOcrProcessor } from './types.ts';
import type { PdfExtractionResult, PdfPageExtractionResult } from './pdf-extraction-result.ts';

export class HybridPdfPageProcessor {
  private readonly ocr: PdfOcrProcessor;
  private readonly policy: PageOcrDecisionPolicy;

  constructor(ocr: PdfOcrProcessor, policy: PageOcrDecisionPolicy) {
    this.ocr = ocr;
    this.policy = policy;
  }

  async process(buffer: Buffer, nativePages: readonly NativePdfPage[]): Promise<PdfExtractionResult> {
    const pages = nativePages.map((page) => this.classify(page));
    const weakPageNumbers = pages
      .filter((page) => page.status === 'needs_ocr')
      .map((page) => page.pageNumber);

    if (weakPageNumbers.length > 0) {
      const ocr = await this.ocr.recognize(buffer, weakPageNumbers);
      if (ocr.status === 'unavailable') return needsOcrResult(pages, ocr.reason);
      replaceWeakPages(pages, ocr.pages);
    }

    if (pages.some((page) => page.status === 'needs_ocr')) {
      return needsOcrResult(pages, 'incomplete_ocr');
    }
    return {
      averageConfidence: averageConfidence(pages),
      pages,
      status: 'ready',
      text: pages.map((page) => page.text).join('\n\n'),
    };
  }

  private classify(page: NativePdfPage): PdfPageExtractionResult {
    const decision = this.policy.evaluate(page.text);
    return {
      confidence: clampConfidence(decision.confidence),
      ocrReasons: decision.reasons,
      pageNumber: page.pageNumber,
      source: 'native',
      status: decision.needsOcr ? 'needs_ocr' : 'ready',
      text: page.text,
    };
  }
}

function replaceWeakPages(
  pages: PdfPageExtractionResult[],
  replacements: readonly { confidence: number; pageNumber: number; text: string }[],
): void {
  const recognized = new Map(replacements.map((page) => [page.pageNumber, page]));
  for (const page of pages) {
    if (page.status !== 'needs_ocr') continue;
    const replacement = recognized.get(page.pageNumber);
    if (!replacement?.text.trim()) continue;
    page.confidence = clampConfidence(replacement.confidence);
    page.source = 'ocr';
    page.status = 'ready';
    page.text = `[PDF page ${page.pageNumber}]\n${replacement.text.trim()}`;
  }
}

function needsOcrResult(
  pages: PdfPageExtractionResult[],
  reason: Extract<PdfExtractionResult, { status: 'needs_ocr' }>['reason'],
): Extract<PdfExtractionResult, { status: 'needs_ocr' }> {
  return { averageConfidence: averageConfidence(pages), pages, reason, status: 'needs_ocr' };
}

function averageConfidence(pages: readonly PdfPageExtractionResult[]): number {
  if (pages.length === 0) return 0;
  return clampConfidence(pages.reduce((total, page) => total + page.confidence, 0) / pages.length);
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
