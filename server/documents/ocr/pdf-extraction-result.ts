export interface PdfPageExtractionResult {
  confidence: number;
  ocrReasons: string[];
  pageNumber: number;
  source: 'native' | 'ocr';
  status: 'needs_ocr' | 'ready';
  text: string;
}

export type PdfExtractionResult =
  | {
      averageConfidence: number;
      pages: PdfPageExtractionResult[];
      status: 'ready';
      text: string;
    }
  | {
      averageConfidence: number;
      pages: PdfPageExtractionResult[];
      reason: 'failed' | 'incomplete_ocr' | 'output_limit' | 'timeout' | 'tool_unavailable';
      status: 'needs_ocr';
    };

export class PdfOcrRequiredError extends Error {
  readonly code = 'PDF_OCR_REQUIRED';
  readonly result: Extract<PdfExtractionResult, { status: 'needs_ocr' }>;

  constructor(result: Extract<PdfExtractionResult, { status: 'needs_ocr' }>) {
    super(`PDF requires OCR (${result.reason}).`);
    this.name = 'PdfOcrRequiredError';
    this.result = result;
  }
}
