import type {
  DocumentProcessingState,
  DocumentProcessingSummary,
} from '../../shared/contracts/document-processing.ts';
import { parseDocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';
import type { DocumentProcessorPort } from './document-processor-port.ts';
import {
  assertCurrentProcessingAttempt,
  assertDocumentProcessingTransition,
} from './document-processing-transitions.ts';
import type { DocumentStore } from './document-store.ts';
import { hasSufficientDocumentText } from './document-text-policy.ts';

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

  async approveReview(documentId: string): Promise<DocumentProcessingState> {
    const state = await this.documents.processingState(documentId);
    if (state.summary.status !== 'review_required') {
      throw new AppError(
        'DOCUMENT_REVIEW_NOT_REQUIRED',
        'Only a document awaiting OCR review can be approved.',
        409,
      );
    }
    const text = await this.documents.readText(documentId);
    if (!hasSufficientDocumentText(text)) {
      throw new AppError(
        'DOCUMENT_REVIEW_TEXT_INSUFFICIENT',
        'OCR review cannot be approved without sufficient extracted text.',
        422,
      );
    }
    return this.documents.updateProcessing(documentId, (current) => {
      if (current.summary.status !== 'review_required') {
        throw new AppError(
          'DOCUMENT_REVIEW_NOT_REQUIRED',
          'Only a document awaiting OCR review can be approved.',
          409,
        );
      }
      assertDocumentProcessingTransition(current.summary.status, 'ready');
      return {
        ...current,
        summary: { ...current.summary, failureCode: null, status: 'ready' },
      };
    });
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
      if (summary.status === 'ready' && !hasSufficientDocumentText(output.text)) {
        throw new AppError(
          'DOCUMENT_PROCESSING_FAILED',
          'A ready document processing result must contain sufficient text.',
          422,
        );
      }
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
      assertCurrentProcessingAttempt(current, generation);
      assertDocumentProcessingTransition(current.summary.status, summary.status);
      return { generation, summary };
    }, text);
  }

  private failAttempt(
    documentId: string,
    generation: number,
    code: string,
  ): Promise<DocumentProcessingState> {
    return this.documents.updateProcessing(documentId, (current) => {
      assertCurrentProcessingAttempt(current, generation);
      assertDocumentProcessingTransition(current.summary.status, 'failed');
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

function failureCode(error: unknown): string {
  return error instanceof AppError ? error.code : 'DOCUMENT_PROCESSING_FAILED';
}
