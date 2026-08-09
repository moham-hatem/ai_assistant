import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_DOCUMENT_SIZE_BYTES } from '../../shared/document-limits.ts';
import { uploadBookEdition } from '../../src/features/admin/books/api/book-edition-upload.ts';
import { BooksApiError } from '../../src/features/admin/books/api/book-parser.ts';
import { parseBookEditionUpload } from '../../src/features/admin/books/api/book-upload-parser.ts';
import {
  classifyBookEditionUploadError,
  initialBookEditionUploadState,
  isCurrentUploadRequest,
  successfulBookEditionUploadState,
} from '../../src/features/admin/books/books-state.ts';

const book = {
  authorOrOrganization: 'Learning Centre',
  createdAt: '2026-08-06T08:00:00.000Z',
  id: 'a1111111-1111-4111-8111-111111111111',
  language: 'en',
  subject: 'Foundations',
  title: 'Learning Book',
  updatedAt: '2026-08-06T09:00:00.000Z',
};
const document = {
  characterCount: 84,
  format: 'text',
  id: 'd4444444-4444-4444-8444-444444444444',
  importedAt: '2026-08-06T09:00:00.000Z',
  name: 'lesson copy.txt',
  processing: {
    averageConfidence: null,
    failureCode: null,
    lowConfidencePageCount: 0,
    method: 'native',
    ocrPageCount: 0,
    pageCount: 1,
    processedAt: '2026-08-06T09:00:00.000Z',
    status: 'ready',
  },
  size: 84,
};
const edition = {
  archivedAt: null,
  bookId: book.id,
  contentHash: 'a'.repeat(64),
  createdAt: '2026-08-06T09:00:00.000Z',
  id: 'b2222222-2222-4222-8222-222222222222',
  originalDocumentReference: `document:${document.id}`,
  publishedAt: null,
  status: 'ready',
  version: '2.0 beta',
};
const payload = { book, document, edition, requestId: 'ignored' };

const pendingSummaries = {
  ocr_required: {
    ...document.processing,
    averageConfidence: 0.52,
    failureCode: 'PDF_OCR_TOOL_UNAVAILABLE',
    method: 'ocr',
    ocrPageCount: 1,
    status: 'ocr_required',
  },
  processing: { ...document.processing, processedAt: null, status: 'processing' },
  review_required: {
    ...document.processing,
    averageConfidence: 0.64,
    method: 'ocr',
    ocrPageCount: 1,
    status: 'review_required',
  },
} as const;

test('linked upload parser accepts coherent ready and persisted OCR processing results', () => {
  assert.deepEqual(
    parseBookEditionUpload(payload, book.id, edition.version),
    payloadWithoutMetadata(),
  );
  assert.throws(
    () => parseBookEditionUpload(
      { ...payload, edition: { ...edition, status: 'published' } },
      book.id,
      edition.version,
    ),
    BooksApiError,
  );
  for (const processingStatus of ['processing', 'ocr_required', 'review_required'] as const) {
    const pendingPayload = {
      ...payload,
      document: { ...document, processing: pendingSummaries[processingStatus] },
      edition: { ...edition, status: 'processing' },
    };
    assert.deepEqual(
      parseBookEditionUpload(pendingPayload, book.id, edition.version),
      { book, document: pendingPayload.document, edition: pendingPayload.edition },
    );
  }

  const contradictoryPayloads = [
    { ...payload, document: { ...document, processing: pendingSummaries.review_required } },
    { ...payload, edition: { ...edition, status: 'processing' } },
    {
      ...payload,
      document: { ...document, processing: { ...document.processing, status: 'failed' } },
      edition: { ...edition, status: 'processing' },
    },
  ];
  for (const contradictory of contradictoryPayloads) {
    assert.throws(
      () => parseBookEditionUpload(contradictory, book.id, edition.version),
      BooksApiError,
    );
  }
  assert.throws(
    () => parseBookEditionUpload(
      {
        ...payload,
        document: {
          ...document,
          processing: { ...document.processing, method: 'native', ocrPageCount: 1 },
        },
      },
      book.id,
      edition.version,
    ),
    BooksApiError,
  );
  assert.throws(
    () => parseBookEditionUpload(
      { ...payload, document: { ...document, format: 'epub' } },
      book.id,
      edition.version,
    ),
    BooksApiError,
  );
  assert.throws(
    () => parseBookEditionUpload(
      { ...payload, edition: { ...edition, bookId: 'another-book' } },
      book.id,
      edition.version,
    ),
    BooksApiError,
  );
  assert.throws(
    () => parseBookEditionUpload(payload, 'another-book', edition.version),
    BooksApiError,
  );
  assert.throws(
    () => parseBookEditionUpload(payload, book.id, 'another-version'),
    BooksApiError,
  );
});

test('linked upload client sends encoded identity and reports upload progress', async () => {
  const request = new FakeUploadRequest(payload, 201);
  const progress: number[] = [];
  const file = new File(['Trusted educational content with enough text for extraction.'], document.name, {
    type: 'text/plain',
  });

  const result = await uploadBookEdition(book.id, ' 2.0 beta ', file, {
    createRequest: () => request,
    onProgress: (value) => progress.push(value),
  });

  assert.equal(request.method, 'POST');
  assert.equal(
    request.url,
    `/api/knowledge/documents?bookId=${book.id}&version=2.0+beta&name=lesson+copy.txt`,
  );
  assert.equal(request.headers['Content-Type'], 'text/plain');
  assert.equal(request.body, file);
  assert.deepEqual(progress, [50, 100]);
  assert.equal(result.edition.status, 'ready');
});

test('linked upload client treats a persisted scanned PDF needing OCR as success', async () => {
  const scannedPayload = {
    ...payload,
    document: { ...document, format: 'pdf', processing: pendingSummaries.ocr_required },
    edition: { ...edition, status: 'processing' },
  };
  const result = await uploadBookEdition(book.id, edition.version, file('scan.pdf', 80), {
    createRequest: () => new FakeUploadRequest(scannedPayload, 201),
  });
  assert.equal(result.edition.status, 'processing');
  assert.equal(result.document.processing.status, 'ocr_required');
  assert.deepEqual(successfulBookEditionUploadState(result), {
    error: null,
    processingStatus: 'ocr_required',
    progress: 100,
    status: 'success',
    version: edition.version,
  });
});

test('linked upload client validates version, file type, emptiness, and size before transport', async () => {
  let created = false;
  const options = { createRequest: () => { created = true; return new FakeUploadRequest(payload, 201); } };
  await rejectsWithCode(uploadBookEdition(book.id, ' ', file('lesson.txt', 80), options), 'INVALID_VERSION');
  await rejectsWithCode(uploadBookEdition(book.id, 'v1', file('lesson.exe', 80), options), 'UNSUPPORTED_FILE_TYPE');
  await rejectsWithCode(uploadBookEdition(book.id, 'v1', file('lesson.txt', 0), options), 'EMPTY_FILE');
  await rejectsWithCode(
    uploadBookEdition(book.id, 'v1', file('lesson.pdf', MAX_DOCUMENT_SIZE_BYTES + 1), options),
    'FILE_TOO_LARGE',
  );
  assert.equal(created, false);
});

test('linked upload client preserves stable backend failures without exposing messages', async () => {
  const request = new FakeUploadRequest(
    { code: 'DUPLICATE_EDITION', message: 'internal repository detail' },
    409,
  );
  await rejectsWithCode(
    uploadBookEdition(book.id, 'v2', file('lesson.txt', 80), { createRequest: () => request }),
    'DUPLICATE_EDITION',
  );
});

test('linked upload client rejects a successful payload for a different version', async () => {
  const mismatched = {
    ...payload,
    edition: { ...edition, version: 'another-version' },
  };
  await rejectsWithCode(
    uploadBookEdition(book.id, ' 2.0 beta ', file('lesson.txt', 80), {
      createRequest: () => new FakeUploadRequest(mismatched, 201),
    }),
    'INVALID_RESPONSE',
  );
});

test('upload state classifies operator-facing failures and guards stale book races', () => {
  assert.deepEqual(initialBookEditionUploadState(), {
    error: null,
    processingStatus: null,
    progress: 0,
    status: 'idle',
    version: null,
  });
  assert.equal(classifyBookEditionUploadError(apiError('DUPLICATE_EDITION')), 'duplicate');
  assert.equal(classifyBookEditionUploadError(apiError('REQUEST_TOO_LARGE')), 'file-size');
  assert.equal(classifyBookEditionUploadError(apiError('INVALID_REQUEST')), 'extraction');
  assert.equal(classifyBookEditionUploadError(apiError('DOCUMENT_EXTRACTION_FAILED')), 'extraction');
  assert.equal(classifyBookEditionUploadError(apiError('NETWORK_ERROR')), 'unavailable');
  assert.equal(isCurrentUploadRequest(book.id, book.id, 7, 7), true);
  assert.equal(isCurrentUploadRequest('new-book', book.id, 7, 7), false);
  assert.equal(isCurrentUploadRequest(book.id, book.id, 8, 7), false);
});

class FakeUploadRequest {
  body: File | null = null;
  headers: Record<string, string> = {};
  method = '';
  onabort: ((event: ProgressEvent) => void) | null = null;
  onerror: ((event: ProgressEvent) => void) | null = null;
  onload: ((event: ProgressEvent) => void) | null = null;
  response: unknown;
  responseText = '';
  responseType: XMLHttpRequestResponseType = '';
  status: number;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  url = '';

  constructor(response: unknown, status: number) {
    this.response = response;
    this.status = status;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: File) {
    this.body = body;
    this.upload.onprogress?.(progressEvent(40, 80));
    this.upload.onprogress?.(progressEvent(80, 80));
    queueMicrotask(() => this.onload?.(progressEvent(80, 80)));
  }
}

function progressEvent(loaded: number, total: number): ProgressEvent {
  return { lengthComputable: true, loaded, total } as ProgressEvent;
}

function file(name: string, size: number): File {
  return { name, size, type: 'application/octet-stream' } as File;
}

function apiError(code: string): BooksApiError {
  return new BooksApiError(code, 400, code);
}

async function rejectsWithCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof BooksApiError);
    assert.equal(error.code, code);
    return true;
  });
}

function payloadWithoutMetadata() {
  return { book, document, edition: { ...edition, contentHash: edition.contentHash.toLowerCase() } };
}
