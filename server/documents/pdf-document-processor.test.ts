import assert from 'node:assert/strict';
import test from 'node:test';
import type { PdfExtractionResult } from './ocr/pdf-extraction-result.ts';
import { PdfDocumentProcessor } from './pdf-document-processor.ts';

test('hybrid PDF results become ready with consistent page counts', async () => {
  const processor = processorFor({
    averageConfidence: 0.9,
    pages: [
      page(1, 'native', 0.95, 'Native page text with enough useful material.'),
      page(2, 'ocr', 0.85, 'OCR page text with enough useful material.'),
    ],
    status: 'ready',
    text: 'Native page text with enough useful material.\n\nOCR page text with enough useful material.',
  });

  assert.deepEqual((await process(processor)).summary, {
    averageConfidence: 0.9,
    failureCode: null,
    lowConfidencePageCount: 0,
    method: 'hybrid',
    ocrPageCount: 1,
    pageCount: 2,
    processedAt: '2026-08-09T12:00:00.000Z',
    status: 'ready',
  });
});

test('low-confidence OCR results require review while native PDFs remain unaffected', async () => {
  const lowConfidence = await process(processorFor({
    averageConfidence: 0.7,
    pages: [page(1, 'ocr', 0.7, 'Recognized page with enough text for a human reviewer.')],
    status: 'ready',
    text: 'Recognized page with enough text for a human reviewer.',
  }));
  assert.equal(lowConfidence.summary.status, 'review_required');
  assert.equal(lowConfidence.summary.lowConfidencePageCount, 1);
  assert.equal(lowConfidence.summary.method, 'ocr');

  const native = await process(processorFor({
    averageConfidence: 0.98,
    pages: [page(1, 'native', 0.98, 'Existing native PDF text remains ready without OCR.')],
    status: 'ready',
    text: 'Existing native PDF text remains ready without OCR.',
  }));
  assert.deepEqual(native.summary, {
    averageConfidence: null,
    failureCode: null,
    lowConfidencePageCount: 0,
    method: 'native',
    ocrPageCount: 0,
    pageCount: 1,
    processedAt: '2026-08-09T12:00:00.000Z',
    status: 'ready',
  });
});

test('unavailable OCR is classified as ocr_required without inventing page text', async () => {
  const output = await process(processorFor({
    averageConfidence: 0.2,
    pages: [page(1, 'native', 0.2, '', 'needs_ocr')],
    reason: 'tool_unavailable',
    status: 'needs_ocr',
  }));

  assert.equal(output.text, '');
  assert.equal(output.summary.status, 'ocr_required');
  assert.equal(output.summary.failureCode, 'PDF_OCR_TOOL_UNAVAILABLE');
  assert.equal(output.summary.pageCount, 1);
});

function processorFor(result: PdfExtractionResult): PdfDocumentProcessor {
  return new PdfDocumentProcessor(
    { async extractDetailed() { return result; } },
    {
      confidenceThreshold: 0.75,
      now: () => new Date('2026-08-09T12:00:00.000Z'),
    },
  );
}

function process(processor: PdfDocumentProcessor) {
  return processor.process({
    documentId: crypto.randomUUID(),
    generation: 0,
    name: 'source.pdf',
    source: Buffer.from('pdf'),
  });
}

function page(
  pageNumber: number,
  source: 'native' | 'ocr',
  confidence: number,
  text: string,
  status: 'needs_ocr' | 'ready' = 'ready',
) {
  return { confidence, ocrReasons: [], pageNumber, source, status, text };
}
