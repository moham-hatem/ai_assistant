export const DEFAULT_OCR_LANGUAGES = ['ara', 'eng', 'swa'] as const;

export interface RasterizePageInput {
  outputDirectory: string;
  pageNumber: number;
  pdfPath: string;
}

export interface RasterizedPage {
  imagePath: string;
  pageNumber: number;
}

export interface PageRasterizer {
  rasterize(input: RasterizePageInput): Promise<RasterizedPage>;
}

export interface RecognizePageInput {
  imagePath: string;
  languages: readonly string[];
  pageNumber: number;
}

export interface OcrPageResult {
  confidence: number;
  pageNumber: number;
  text: string;
}

export interface OcrEngine {
  recognize(input: RecognizePageInput): Promise<OcrPageResult>;
}

export type OcrUnavailableReason = 'failed' | 'output_limit' | 'timeout' | 'tool_unavailable';

export type OcrBatchResult =
  | {
      averageConfidence: number;
      pages: OcrPageResult[];
      status: 'completed';
    }
  | {
      pages: [];
      reason: OcrUnavailableReason;
      status: 'unavailable';
    };

export interface PdfOcrProcessor {
  recognize(buffer: Buffer, pageNumbers: readonly number[]): Promise<OcrBatchResult>;
}

export interface PageOcrDecision {
  confidence: number;
  needsOcr: boolean;
  reasons: string[];
}

export interface PageOcrDecisionContext {
  hasRasterContent: boolean;
}

export interface PageOcrDecisionPolicy {
  evaluate(text: string, context: PageOcrDecisionContext): PageOcrDecision;
}
