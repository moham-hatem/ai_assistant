import type { DocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';

export interface DocumentProcessingInput {
  documentId: string;
  generation: number;
  name: string;
  source: Buffer;
}

export interface DocumentProcessingOutput {
  summary: DocumentProcessingSummary;
  text: string;
}

export interface DocumentProcessorPort {
  process(input: DocumentProcessingInput): Promise<DocumentProcessingOutput>;
}

export class UnavailableDocumentProcessor implements DocumentProcessorPort {
  async process(): Promise<never> {
    throw new AppError(
      'DOCUMENT_PROCESSOR_UNAVAILABLE',
      'No document processor is configured.',
      503,
    );
  }
}
