import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approveEditionProcessing,
  fetchEditionProcessing,
  reprocessEdition,
} from '../api/book-processing.ts';
import { availableProcessingActions } from '../processing-action-availability.ts';
import {
  isCurrentEditionProcessingRequest,
  processingActionFailed,
  processingActionStarted,
  processingLoadFailed,
  processingLoadStarted,
  processingLoadSucceeded,
  processingPageLoading,
} from '../processing-state.ts';
import type {
  BookEdition,
  EditionProcessingAction,
  EditionProcessingEntries,
} from '../types.ts';

export interface EditionProcessingController {
  approve: (editionId: string) => Promise<boolean>;
  entries: EditionProcessingEntries;
  reprocess: (editionId: string) => Promise<boolean>;
  retry: (editionId: string) => void;
}

export function useEditionProcessing(
  bookId: string | null,
  editions: readonly BookEdition[],
): EditionProcessingController {
  const editionKey = editions
    .map(({ id, originalDocumentReference, status }) => `${id}:${status}:${originalDocumentReference}`)
    .join('|');
  const [entries, setEntries] = useState<EditionProcessingEntries>({});
  const activeBookIdRef = useRef(bookId);
  const visibleEditionsRef = useRef(new Map(editions.map((edition) => [edition.id, edition])));
  const requestTokensRef = useRef(new Map<string, number>());
  const requestCounterRef = useRef(0);
  const controllersRef = useRef(new Map<string, AbortController>());
  const actionLocksRef = useRef(new Set<string>());

  const isCurrent = useCallback((requestedBookId: string, editionId: string, token: number) => (
    isCurrentEditionProcessingRequest(
      activeBookIdRef.current,
      requestedBookId,
      new Set(visibleEditionsRef.current.keys()),
      editionId,
      requestTokensRef.current.get(editionId),
      token,
    )
  ), []);

  const load = useCallback((requestedBookId: string, editionId: string) => {
    controllersRef.current.get(editionId)?.abort();
    const controller = new AbortController();
    const token = ++requestCounterRef.current;
    controllersRef.current.set(editionId, controller);
    requestTokensRef.current.set(editionId, token);
    setEntries((current) => processingLoadStarted(current, editionId));

    void fetchEditionProcessing(requestedBookId, editionId, controller.signal).then((processing) => {
      if (isCurrent(requestedBookId, editionId, token)) {
        setEntries((current) => processingLoadSucceeded(current, editionId, processing));
      }
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')
        && isCurrent(requestedBookId, editionId, token)) {
        setEntries((current) => processingLoadFailed(current, editionId));
      }
    }).finally(() => {
      if (controllersRef.current.get(editionId) === controller) {
        controllersRef.current.delete(editionId);
      }
    });
  }, [isCurrent]);

  useEffect(() => {
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    requestTokensRef.current.clear();
    actionLocksRef.current.clear();
    activeBookIdRef.current = bookId;
    visibleEditionsRef.current = new Map(editions.map((edition) => [edition.id, edition]));
    const ids = editions.map(({ id }) => id);
    setEntries(processingPageLoading(ids));
    if (bookId) ids.forEach((editionId) => load(bookId, editionId));

    return () => {
      for (const controller of controllersRef.current.values()) controller.abort();
    };
  }, [bookId, editionKey, load]);

  const runAction = useCallback(async (
    editionId: string,
    action: EditionProcessingAction,
  ): Promise<boolean> => {
    const requestedBookId = activeBookIdRef.current;
    const edition = visibleEditionsRef.current.get(editionId);
    const processingStatus = entries[editionId]?.processing?.summary.status;
    if (!requestedBookId || !edition || !processingStatus || actionLocksRef.current.has(editionId)) {
      return false;
    }
    if (!availableProcessingActions(edition.status, processingStatus).includes(action)) return false;

    actionLocksRef.current.add(editionId);
    controllersRef.current.get(editionId)?.abort();
    const controller = new AbortController();
    const token = ++requestCounterRef.current;
    controllersRef.current.set(editionId, controller);
    requestTokensRef.current.set(editionId, token);
    setEntries((current) => processingActionStarted(current, editionId, action));
    try {
      const processing = action === 'approve'
        ? await approveEditionProcessing(requestedBookId, editionId, controller.signal)
        : await reprocessEdition(requestedBookId, editionId, controller.signal);
      if (!isCurrent(requestedBookId, editionId, token)) return false;
      setEntries((current) => processingLoadSucceeded(current, editionId, processing));
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')
        && isCurrent(requestedBookId, editionId, token)) {
        setEntries((current) => processingActionFailed(current, editionId, action));
      }
      return false;
    } finally {
      actionLocksRef.current.delete(editionId);
      if (controllersRef.current.get(editionId) === controller) {
        controllersRef.current.delete(editionId);
      }
    }
  }, [entries, isCurrent]);

  return {
    approve: (editionId) => runAction(editionId, 'approve'),
    entries,
    reprocess: (editionId) => runAction(editionId, 'reprocess'),
    retry: (editionId) => {
      const requestedBookId = activeBookIdRef.current;
      if (requestedBookId && visibleEditionsRef.current.has(editionId)) load(requestedBookId, editionId);
    },
  };
}
