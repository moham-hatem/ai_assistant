import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseDocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';
import type {
  DocumentProcessingOutput,
  DocumentProcessorPort,
} from './document-processor-port.ts';
import { DocumentProcessingService } from './document-processing-service.ts';
import { allowedDocumentProcessingTransitions } from './document-processing-transitions.ts';
import { DocumentStore } from './document-store.ts';
import { AppError } from '../errors.ts';

test('processing transitions are deny-by-default', () => {
  assert.deepEqual(allowedDocumentProcessingTransitions('ready'), ['processing']);
  assert.deepEqual(
    allowedDocumentProcessingTransitions('processing'),
    ['ready', 'ocr_required', 'review_required', 'failed'],
  );
  assert.equal(allowedDocumentProcessingTransitions('review_required').includes('ready'), false);
  assert.equal(allowedDocumentProcessingTransitions('failed').includes('ready'), false);
});

test('processing summary parser rejects contradictory page, method, and confidence fields', () => {
  const valid = output('').summary;
  const contradictory = [
    { ...valid, ocrPageCount: valid.pageCount + 1 },
    { ...valid, lowConfidencePageCount: valid.pageCount + 1 },
    { ...valid, averageConfidence: null, method: 'native', ocrPageCount: 1 },
    { ...valid, averageConfidence: 0.9, method: 'native', ocrPageCount: 0 },
    { ...valid, averageConfidence: null, method: 'ocr', ocrPageCount: 1 },
    { ...valid, averageConfidence: null, method: 'hybrid', ocrPageCount: 1 },
  ];

  for (const summary of contradictory) {
    assert.throws(() => parseDocumentProcessingSummary(summary), TypeError);
  }
});

test('a newer processing generation prevents an older result from replacing text', async () => {
  await withStore(async (store, id) => {
    const pending = new Map<number, Deferred<DocumentProcessingOutput>>();
    const processor: DocumentProcessorPort = {
      process(input) {
        const result = deferred<DocumentProcessingOutput>();
        pending.set(input.generation, result);
        return result.promise;
      },
    };
    const service = new DocumentProcessingService(store, processor);

    const first = service.reprocess(id);
    await waitFor(() => pending.has(1));
    const second = service.reprocess(id);
    await waitFor(() => pending.has(2));

    pending.get(2)!.resolve(output('new generation text with enough useful content'));
    assert.equal((await second).generation, 2);
    assert.equal((await store.processingState(id)).generation, 2);
    pending.get(1)!.resolve(output('stale generation text with enough useful content'));
    await assert.rejects(
      first,
      (error: unknown) => error instanceof AppError
        && error.code === 'STALE_DOCUMENT_PROCESSING_RESULT',
    );
    assert.equal(await store.readText(id), 'new generation text with enough useful content');
    assert.equal(
      (await store.readSource(id)).source.toString('utf8'),
      'Original document text with enough content for a successful import.',
    );
    assert.deepEqual(await store.processingState(id), {
      generation: 2,
      summary: {
        ...output('').summary,
        processedAt: (await store.processingState(id)).summary.processedAt,
      },
    });
  });
});

test('processor failures are persisted against their attempt generation', async () => {
  await withStore(async (store, id) => {
    const service = new DocumentProcessingService(store, {
      async process() { throw new Error('engine failed'); },
    }, () => new Date('2026-08-09T12:00:00.000Z'));

    await assert.rejects(
      service.reprocess(id),
      (error: unknown) => error instanceof AppError && error.code === 'DOCUMENT_PROCESSING_FAILED',
    );
    assert.deepEqual(await store.processingState(id), {
      generation: 1,
      summary: {
        averageConfidence: null,
        failureCode: 'DOCUMENT_PROCESSING_FAILED',
        lowConfidencePageCount: 0,
        method: 'native',
        ocrPageCount: 0,
        pageCount: 0,
        processedAt: '2026-08-09T12:00:00.000Z',
        status: 'failed',
      },
    });
  });
});

test('an invalid processor status is rejected instead of normalized to ready', async () => {
  await withStore(async (store, id) => {
    const service = new DocumentProcessingService(store, {
      async process() {
        return {
          ...output('Invalid result text that must not replace the current text.'),
          summary: { ...output('').summary, status: 'unknown' } as never,
        };
      },
    });
    const original = await store.readText(id);

    await assert.rejects(
      service.reprocess(id),
      (error: unknown) => error instanceof AppError && error.code === 'DOCUMENT_PROCESSING_FAILED',
    );
    assert.equal((await store.processingState(id)).summary.status, 'failed');
    assert.equal(await store.readText(id), original);
  });
});

test('a ready processor result with short text fails without replacing stored text', async () => {
  await withStore(async (store, id) => {
    const service = new DocumentProcessingService(store, {
      async process() { return output('  too short  '); },
    });
    const original = await store.readText(id);

    await assert.rejects(
      service.reprocess(id),
      (error: unknown) => error instanceof AppError && error.code === 'DOCUMENT_PROCESSING_FAILED',
    );
    const state = await store.processingState(id);
    assert.equal(state.summary.status, 'failed');
    assert.equal(state.summary.failureCode, 'DOCUMENT_PROCESSING_FAILED');
    assert.equal(await store.readText(id), original);
  });
});

function output(text: string): DocumentProcessingOutput {
  return {
    text,
    summary: {
      averageConfidence: 0.94,
      failureCode: null,
      lowConfidencePageCount: 1,
      method: 'hybrid',
      ocrPageCount: 2,
      pageCount: 3,
      processedAt: null,
      status: 'ready',
    },
  };
}

async function withStore(run: (store: DocumentStore, id: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'document-processing-test-'));
  const store = new DocumentStore(join(root, 'documents'), join(root, 'knowledge'));
  try {
    const document = await store.import({
      buffer: Buffer.from('Original document text with enough content for a successful import.'),
      name: 'source.txt',
    });
    await run(store, document.id);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for processor invocation.');
}
