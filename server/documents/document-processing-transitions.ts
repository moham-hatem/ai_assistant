import type {
  DocumentProcessingState,
  DocumentProcessingStatus,
} from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';

const transitions: Readonly<Record<DocumentProcessingStatus, readonly DocumentProcessingStatus[]>> = {
  failed: ['processing'],
  ocr_required: ['processing'],
  processing: ['ready', 'ocr_required', 'review_required', 'failed'],
  ready: ['processing'],
  review_required: ['processing', 'ready'],
};

export function allowedDocumentProcessingTransitions(
  status: DocumentProcessingStatus,
): readonly DocumentProcessingStatus[] {
  return transitions[status];
}

export function assertDocumentProcessingTransition(
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

export function assertCurrentProcessingAttempt(
  current: DocumentProcessingState,
  generation: number,
): void {
  if (current.generation !== generation || current.summary.status !== 'processing') {
    throw new AppError(
      'STALE_DOCUMENT_PROCESSING_RESULT',
      'A newer document processing attempt superseded this result.',
      409,
    );
  }
}
