import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadBookEdition } from '../api/book-edition-upload';
import {
  classifyBookEditionUploadError,
  initialBookEditionUploadState,
  isCurrentUploadRequest,
  successfulBookEditionUploadState,
} from '../books-state';
import type { BookEditionUploadResult, BookEditionUploadState } from '../types';

export function useBookEditionUpload(
  bookId: string | null,
  onUploaded: (result: BookEditionUploadResult) => void,
) {
  const [state, setState] = useState<BookEditionUploadState>(initialBookEditionUploadState);
  const activeBookIdRef = useRef(bookId);
  const activeRequestIdRef = useRef(0);
  const busyRef = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  useEffect(() => {
    activeBookIdRef.current = bookId;
    activeRequestIdRef.current += 1;
    busyRef.current = false;
    setState(initialBookEditionUploadState());
  }, [bookId]);

  const upload = useCallback(async (file: File, version: string): Promise<boolean> => {
    const requestedBookId = activeBookIdRef.current;
    if (!requestedBookId || busyRef.current) return false;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    busyRef.current = true;
    setState({
      error: null,
      processingStatus: null,
      progress: 0,
      status: 'uploading',
      version: null,
    });

    const isCurrent = () => isCurrentUploadRequest(
      activeBookIdRef.current,
      requestedBookId,
      activeRequestIdRef.current,
      requestId,
    );
    try {
      const result = await uploadBookEdition(requestedBookId, version, file, {
        onProgress: (progress) => {
          if (isCurrent()) setState((current) => ({ ...current, progress }));
        },
      });
      if (!isCurrent()) return false;
      onUploadedRef.current(result);
      setState(successfulBookEditionUploadState(result));
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      setState({
        error: classifyBookEditionUploadError(error),
        processingStatus: null,
        progress: 0,
        status: 'error',
        version: null,
      });
      return false;
    } finally {
      if (isCurrent()) busyRef.current = false;
    }
  }, []);

  return { ...state, upload };
}
