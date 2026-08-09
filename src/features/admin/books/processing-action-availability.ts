import type { DocumentProcessingStatus } from '../../../../shared/contracts/document-processing.ts';
import type { EditionProcessingAction, EditionStatus } from './types.ts';

export function availableProcessingActions(
  editionStatus: EditionStatus,
  processingStatus: DocumentProcessingStatus,
): readonly EditionProcessingAction[] {
  if (editionStatus === 'published' || processingStatus === 'processing') return [];
  return processingStatus === 'review_required'
    ? ['approve', 'reprocess']
    : ['reprocess'];
}
