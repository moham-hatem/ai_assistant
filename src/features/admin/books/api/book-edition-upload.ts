import { MAX_DOCUMENT_SIZE_BYTES } from '../../../../../shared/document-limits.ts';
import type { BookEditionUploadResult } from '../types';
import { BooksApiError } from './book-parser.ts';
import { parseBookEditionUpload } from './book-upload-parser.ts';

const supportedExtensions = new Set(['docx', 'md', 'pdf', 'txt']);

interface UploadRequest {
  onabort: ((event: ProgressEvent) => void) | null;
  onerror: ((event: ProgressEvent) => void) | null;
  onload: ((event: ProgressEvent) => void) | null;
  open(method: string, url: string): void;
  response: unknown;
  responseText: string;
  responseType: XMLHttpRequestResponseType;
  send(body: File): void;
  setRequestHeader(name: string, value: string): void;
  status: number;
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
}

export interface BookEditionUploadOptions {
  createRequest?: () => UploadRequest;
  onProgress?: (percentage: number) => void;
}

export async function uploadBookEdition(
  bookId: string,
  version: string,
  file: File,
  options: BookEditionUploadOptions = {},
): Promise<BookEditionUploadResult> {
  const normalizedVersion = validateUpload(version, file);
  const query = new URLSearchParams({ bookId, version: normalizedVersion, name: file.name });
  const request = options.createRequest?.() ?? new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    request.open('POST', `/api/knowledge/documents?${query}`);
    request.responseType = 'json';
    request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(unavailable());
    request.onabort = () => reject(unavailable());
    request.onload = () => {
      const payload = readPayload(request);
      if (request.status < 200 || request.status >= 300) {
        const code = readErrorCode(payload);
        reject(new BooksApiError(code, request.status, code));
        return;
      }
      try {
        resolve(parseBookEditionUpload(payload, bookId, normalizedVersion));
      } catch (error) {
        reject(error);
      }
    };
    request.send(file);
  });
}

function validateUpload(version: string, file: File): string {
  const normalizedVersion = version.trim();
  if (!normalizedVersion || normalizedVersion.length > 100) {
    throw new BooksApiError('INVALID_VERSION', null, 'INVALID_VERSION');
  }
  if (file.size === 0) throw new BooksApiError('EMPTY_FILE', null, 'EMPTY_FILE');
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    throw new BooksApiError('FILE_TOO_LARGE', null, 'FILE_TOO_LARGE');
  }
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !supportedExtensions.has(extension)) {
    throw new BooksApiError('UNSUPPORTED_FILE_TYPE', null, 'UNSUPPORTED_FILE_TYPE');
  }
  return normalizedVersion;
}

function readPayload(request: UploadRequest): unknown {
  if (request.response !== null && request.response !== undefined) return request.response;
  try {
    return JSON.parse(request.responseText);
  } catch {
    return null;
  }
}

function readErrorCode(value: unknown): string {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const code = (value as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return 'REQUEST_FAILED';
}

function unavailable() {
  return new BooksApiError('Books API could not be reached.', null, 'NETWORK_ERROR');
}
