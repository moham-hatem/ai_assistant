import type {
  DocumentProcessingMethod,
  DocumentProcessingStatus,
} from '../../shared/contracts/document-processing.ts';
import { hasSufficientDocumentText } from './document-text-policy.ts';
import type {
  DocumentProcessingInput,
  DocumentProcessingOutput,
  DocumentProcessorPort,
} from './document-processor-port.ts';
import { PdfExtractor } from './extractors/pdf.ts';
import type { PdfExtractionResult } from './ocr/pdf-extraction-result.ts';

export interface PdfDocumentProcessorOptions {
  confidenceThreshold?: number;
  now?: () => Date;
}

export class PdfDocumentProcessor implements DocumentProcessorPort {
  private readonly confidenceThreshold: number;
  private readonly extractor: Pick<PdfExtractor, 'extractDetailed'>;
  private readonly now: () => Date;

  constructor(
    extractor: Pick<PdfExtractor, 'extractDetailed'> = new PdfExtractor(),
    options: PdfDocumentProcessorOptions = {},
  ) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.75;
    this.extractor = extractor;
    this.now = options.now ?? (() => new Date());
  }

  async process(input: DocumentProcessingInput): Promise<DocumentProcessingOutput> {
    const result = await this.extractor.extractDetailed(input.source);
    const method = processingMethod(result);
    const lowConfidencePageCount = result.pages.filter(
      (page) => page.confidence < this.confidenceThreshold,
    ).length;
    const text = extractionText(result).trim();
    const status = processingStatus(result, text, lowConfidencePageCount);

    return {
      text,
      summary: {
        averageConfidence: method === 'native' ? null : result.averageConfidence,
        failureCode: failureCode(result, text),
        lowConfidencePageCount,
        method,
        ocrPageCount: result.pages.filter((page) => page.source === 'ocr').length,
        pageCount: result.pages.length,
        processedAt: this.now().toISOString(),
        status,
      },
    };
  }
}

function processingMethod(result: PdfExtractionResult): DocumentProcessingMethod {
  const ocrPageCount = result.pages.filter((page) => page.source === 'ocr').length;
  if (ocrPageCount === 0) return 'native';
  return ocrPageCount === result.pages.length ? 'ocr' : 'hybrid';
}

function processingStatus(
  result: PdfExtractionResult,
  text: string,
  lowConfidencePageCount: number,
): DocumentProcessingStatus {
  if (result.status === 'needs_ocr' || !hasSufficientDocumentText(text)) return 'ocr_required';
  return lowConfidencePageCount > 0 ? 'review_required' : 'ready';
}

function extractionText(result: PdfExtractionResult): string {
  if (result.status === 'ready') return result.text;
  return result.pages
    .filter((page) => page.status === 'ready')
    .map((page) => page.text)
    .filter(Boolean)
    .join('\n\n');
}

function failureCode(result: PdfExtractionResult, text: string): string | null {
  if (result.status === 'needs_ocr') return `PDF_OCR_${result.reason.toUpperCase()}`;
  return hasSufficientDocumentText(text) ? null : 'PDF_TEXT_INSUFFICIENT';
}
