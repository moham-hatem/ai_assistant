import type {
  DocumentProcessingState,
  DocumentProcessingStatus,
  DocumentProcessingSummary,
} from '../../shared/contracts/document-processing.ts';
import { parseDocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';
import type { DocumentStore } from './document-store.ts';

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

const transitions: Readonly<Record<DocumentProcessingStatus, readonly DocumentProcessingStatus[]>> = {
  failed: ['processing'],
  ocr_required: ['processing'],
  processing: ['ready', 'ocr_required', 'review_required', 'failed'],
  ready: ['processing'],
  review_required: ['processing'],
};

export function allowedDocumentProcessingTransitions(
  status: DocumentProcessingStatus,
): readonly DocumentProcessingStatus[] {
  return transitions[status];
}

export class DocumentProcessingService {
  private readonly documents: DocumentStore;
  private readonly processor: DocumentProcessorPort;
  private readonly now: () => Date;

  constructor(
    documents: DocumentStore,
    processor: DocumentProcessorPort,
    now: () => Date = () => new Date(),
  ) {
    this.documents = documents;
    this.processor = processor;
    this.now = now;
  }

  processingState(documentId: string): Promise<DocumentProcessingState> {
    return this.documents.processingState(documentId);
  }

  async reprocess(documentId: string): Promise<DocumentProcessingState> {
    const started = await this.beginAttempt(documentId);
    try {
      const { metadata, source } = await this.documents.readSource(documentId);
      const output = await this.processor.process({
        documentId,
        generation: started.generation,
        name: metadata.name,
        source,
      });
      const summary = parseDocumentProcessingSummary(output.summary);
      if (summary.status === 'processing' || summary.status === 'failed') {
        throw new AppError(
          'INVALID_DOCUMENT_PROCESSING_TRANSITION',
          `A processor result cannot finish with status ${summary.status}.`,
          409,
        );
      }
      return await this.completeAttempt(documentId, started.generation, {
        ...summary,
        failureCode: null,
        processedAt: summary.processedAt ?? this.now().toISOString(),
      }, output.text);
    } catch (error) {
      if (error instanceof AppError && error.code === 'STALE_DOCUMENT_PROCESSING_RESULT') {
        throw error;
      }
      await this.failAttempt(documentId, started.generation, failureCode(error)).catch((failure) => {
        if (!(failure instanceof AppError && failure.code === 'STALE_DOCUMENT_PROCESSING_RESULT')) {
          throw failure;
        }
      });
      if (error instanceof AppError) throw error;
      throw new AppError(
        'DOCUMENT_PROCESSING_FAILED',
        'Document processing failed.',
        502,
        { cause: error },
      );
    }
  }

  private beginAttempt(documentId: string): Promise<DocumentProcessingState> {
    return this.documents.updateProcessing(documentId, (current) => ({
      generation: current.generation + 1,
      summary: {
        ...current.summary,
        averageConfidence: null,
        failureCode: null,
        processedAt: null,
        status: 'processing',
      },
    }));
  }

  private completeAttempt(
    documentId: string,
    generation: number,
    summary: DocumentProcessingSummary,
    text: string,
  ): Promise<DocumentProcessingState> {
    return this.documents.updateProcessing(documentId, (current) => {
      assertCurrentAttempt(current, generation);
      assertTransition(current.summary.status, summary.status);
      return { generation, summary };
    }, text);
  }

  private failAttempt(
    documentId: string,
    generation: number,
    code: string,
  ): Promise<DocumentProcessingState> {
    return this.documents.updateProcessing(documentId, (current) => {
      assertCurrentAttempt(current, generation);
      assertTransition(current.summary.status, 'failed');
      return {
        generation,
        summary: {
          ...current.summary,
          averageConfidence: null,
          failureCode: code,
          processedAt: this.now().toISOString(),
          status: 'failed',
        },
      };
    });
  }
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

function assertCurrentAttempt(current: DocumentProcessingState, generation: number): void {
  if (current.generation !== generation || current.summary.status !== 'processing') {
    throw new AppError(
      'STALE_DOCUMENT_PROCESSING_RESULT',
      'A newer document processing attempt superseded this result.',
      409,
    );
  }
}

function assertTransition(
  current: DocumentProcessingStatus,
  target: DocumentProcessingStatus,
): void {
  if (!transitions[current].includes(target)) {
    throw new AppError(
      'INVALID_DOCUMENT_PROCESSING_TRANSITION',
      `Document processing cannot transition from ${current} to ${target}.`,
      409,
    );
  }
}

function failureCode(error: unknown): string {
  return error instanceof AppError ? error.code : 'DOCUMENT_PROCESSING_FAILED';
}
