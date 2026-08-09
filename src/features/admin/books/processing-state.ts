import type { DocumentProcessingState } from '../../../../shared/contracts/document-processing.ts';
import type {
  EditionProcessingAction,
  EditionProcessingEntries,
  EditionProcessingEntry,
} from './types.ts';

export function processingPageLoading(editionIds: readonly string[]): EditionProcessingEntries {
  return Object.fromEntries(editionIds.map((id) => [id, loadingEntry(null)]));
}

export function processingLoadStarted(
  entries: EditionProcessingEntries,
  editionId: string,
): EditionProcessingEntries {
  const current = entries[editionId];
  return replaceEntry(entries, editionId, loadingEntry(current?.processing ?? null));
}

export function processingLoadSucceeded(
  entries: EditionProcessingEntries,
  editionId: string,
  processing: DocumentProcessingState,
): EditionProcessingEntries {
  return replaceEntry(entries, editionId, {
    action: null,
    actionError: null,
    phase: 'ready',
    processing,
  });
}

export function processingLoadFailed(
  entries: EditionProcessingEntries,
  editionId: string,
): EditionProcessingEntries {
  const current = entries[editionId];
  return replaceEntry(entries, editionId, {
    action: null,
    actionError: null,
    phase: 'error',
    processing: current?.processing ?? null,
  });
}

export function processingActionStarted(
  entries: EditionProcessingEntries,
  editionId: string,
  action: EditionProcessingAction,
): EditionProcessingEntries {
  const current = entries[editionId];
  if (!current) return entries;
  return replaceEntry(entries, editionId, { ...current, action, actionError: null });
}

export function processingActionFailed(
  entries: EditionProcessingEntries,
  editionId: string,
  action: EditionProcessingAction,
): EditionProcessingEntries {
  const current = entries[editionId];
  if (!current) return entries;
  return replaceEntry(entries, editionId, { ...current, action: null, actionError: action });
}

export function isCurrentEditionProcessingRequest(
  activeBookId: string | null,
  requestedBookId: string,
  visibleEditionIds: ReadonlySet<string>,
  requestedEditionId: string,
  activeToken: number | undefined,
  requestedToken: number,
): boolean {
  return activeBookId === requestedBookId
    && visibleEditionIds.has(requestedEditionId)
    && activeToken === requestedToken;
}

export function documentIdFromReference(reference: string): string | null {
  const match = reference.match(
    /^document:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu,
  );
  return match?.[1] ?? null;
}

export function safeDocumentFailureCode(value: string | null): string | null {
  return value && /^[A-Z][A-Z0-9_]{0,79}$/u.test(value) ? value : null;
}

function loadingEntry(processing: DocumentProcessingState | null): EditionProcessingEntry {
  return { action: null, actionError: null, phase: 'loading', processing };
}

function replaceEntry(
  entries: EditionProcessingEntries,
  editionId: string,
  entry: EditionProcessingEntry,
): EditionProcessingEntries {
  if (!(editionId in entries)) return entries;
  return { ...entries, [editionId]: entry };
}
