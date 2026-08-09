import assert from 'node:assert/strict';
import test from 'node:test';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TextQualityOcrPolicy } from '../ocr/page-policy.ts';
import type { PageOcrDecisionPolicy, PdfOcrProcessor } from '../ocr/types.ts';
import {
  PdfExtractor,
  PdfOcrRequiredError,
} from './pdf.ts';
import { PdfJsPageReader, type PdfPageReader } from './pdf-reader.ts';

const markerPolicy: PageOcrDecisionPolicy = {
  evaluate(text) {
    const needsOcr = text.includes('weak') || text === '';
    return {
      confidence: needsOcr ? 0.2 : 0.95,
      needsOcr,
      reasons: needsOcr ? ['test_weak_page'] : [],
    };
  },
};

test('hybrid PDF extraction OCRs only weak pages and preserves page order without duplication', async () => {
  const requested: number[][] = [];
  const ocr: PdfOcrProcessor = {
    async recognize(_buffer, pageNumbers) {
      requested.push([...pageNumbers]);
      return {
        averageConfidence: 0.8,
        pages: [{ confidence: 0.8, pageNumber: 2, text: 'OCR second page' }],
        status: 'completed',
      };
    },
  };
  const extractor = new PdfExtractor({
    pageReader: fakePageReader(['Native first page', 'weak', 'Native third page']),
    ocr,
    policy: markerPolicy,
  });

  const result = await extractor.extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.deepEqual(requested, [[2]]);
  assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.deepEqual(result.pages.map((page) => page.source), ['native', 'ocr', 'native']);
  assert.equal(result.averageConfidence, (0.95 + 0.8 + 0.95) / 3);
  assert.ok(result.text.indexOf('Native first page') < result.text.indexOf('OCR second page'));
  assert.ok(result.text.indexOf('OCR second page') < result.text.indexOf('Native third page'));
  assert.equal(result.text.match(/OCR second page/gu)?.length, 1);
  assert.doesNotMatch(result.text, /\bweak\b/u);
});

test('strong native PDF pages bypass OCR', async () => {
  const ocr: PdfOcrProcessor = {
    async recognize() {
      throw new Error('OCR must not run');
    },
  };
  const extractor = new PdfExtractor({
    pageReader: fakePageReader(['Strong page']),
    ocr,
    policy: markerPolicy,
  });

  const result = await extractor.extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'ready');
  if (result.status === 'ready') assert.match(result.text, /Strong page/u);
});

test('unavailable OCR produces a classified result and extract refuses partial text', async () => {
  const ocr: PdfOcrProcessor = {
    async recognize() {
      return { pages: [], reason: 'tool_unavailable', status: 'unavailable' };
    },
  };
  const options = {
    pageReader: fakePageReader(['Strong page', 'weak']),
    ocr,
    policy: markerPolicy,
  };
  const result = await new PdfExtractor(options).extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'needs_ocr');
  if (result.status !== 'needs_ocr') return;
  assert.equal(result.reason, 'tool_unavailable');
  assert.deepEqual(result.pages.map((page) => page.status), ['ready', 'needs_ocr']);
  await assert.rejects(
    () => new PdfExtractor(options).extract(Buffer.from('pdf')),
    (error: unknown) => error instanceof PdfOcrRequiredError
      && error.code === 'PDF_OCR_REQUIRED'
      && error.result.reason === 'tool_unavailable',
  );
});

test('missing or blank OCR page results remain classified as needing OCR', async () => {
  const ocr: PdfOcrProcessor = {
    async recognize() {
      return {
        averageConfidence: 0,
        pages: [{ confidence: 0, pageNumber: 2, text: '   ' }],
        status: 'completed',
      };
    },
  };
  const result = await new PdfExtractor({
    pageReader: fakePageReader(['Strong page', 'weak']),
    ocr,
    policy: markerPolicy,
  }).extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'needs_ocr');
  if (result.status === 'needs_ocr') assert.equal(result.reason, 'incomplete_ocr');
});

test('blank and short text-only pages remain valid when local OCR tools are unavailable', async () => {
  const ocr: PdfOcrProcessor = {
    async recognize() {
      throw new Error('OCR must not run for text-only pages');
    },
  };
  const extractor = new PdfExtractor({
    pageReader: fakePageReader([
      { hasRasterContent: false, text: 'Short cover title' },
      { hasRasterContent: false, text: '' },
    ]),
    ocr,
    policy: new TextQualityOcrPolicy(),
  });
  const result = await extractor.extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'ready');
  assert.deepEqual(result.pages.map((page) => page.status), ['ready', 'ready']);
  assert.match(result.status === 'ready' ? result.text : '', /Short cover title/u);
  assert.match(await extractor.extract(Buffer.from('pdf')), /Short cover title/u);
});

test('scanned and sparse infographic pages use OCR while mixed page order stays stable', async () => {
  const requested: number[][] = [];
  const ocr: PdfOcrProcessor = {
    async recognize(_buffer, pageNumbers) {
      requested.push([...pageNumbers]);
      return {
        averageConfidence: 0.85,
        pages: [
          { confidence: 0.9, pageNumber: 2, text: 'Scanned second page' },
          { confidence: 0.8, pageNumber: 3, text: 'Infographic third page' },
        ],
        status: 'completed',
      };
    },
  };
  const body = 'A sufficiently long native text page with enough distinct words to pass the configured quality thresholds without OCR.';
  const result = await new PdfExtractor({
    pageReader: fakePageReader([
      { hasRasterContent: false, text: 'Cover' },
      { hasRasterContent: true, text: '' },
      { hasRasterContent: true, text: 'Tiny caption' },
      { hasRasterContent: false, text: body },
    ]),
    ocr,
    policy: new TextQualityOcrPolicy(),
  }).extractDetailed(Buffer.from('pdf'));

  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') return;
  assert.deepEqual(requested, [[2, 3]]);
  assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2, 3, 4]);
  assert.deepEqual(result.pages.map((page) => page.source), ['native', 'ocr', 'ocr', 'native']);
  assert.ok(result.text.indexOf('Cover') < result.text.indexOf('Scanned second page'));
  assert.ok(result.text.indexOf('Scanned second page') < result.text.indexOf('Infographic third page'));
  assert.ok(result.text.indexOf('Infographic third page') < result.text.indexOf(body));
});

test('pdfjs reader destroys its loading task after load and page extraction failures', async () => {
  let loadFailureDestroyed = false;
  const loadFailure = new PdfJsPageReader(() => ({
    async destroy() {
      loadFailureDestroyed = true;
    },
    promise: Promise.reject(new Error('invalid pdf')),
  }));
  await assert.rejects(() => loadFailure.read(Buffer.from('bad')), /invalid pdf/u);
  assert.equal(loadFailureDestroyed, true);

  let pageFailureDestroyed = false;
  const pageFailure = new PdfJsPageReader(() => ({
    async destroy() {
      pageFailureDestroyed = true;
    },
    promise: Promise.resolve({
      async getPage() {
        return {
          async getOperatorList() {
            return { fnArray: [] };
          },
          async getTextContent() {
            throw new Error('broken page');
          },
          getViewport() {
            return { height: 800, width: 600 };
          },
        };
      },
      numPages: 1,
    }),
  }));
  await assert.rejects(() => pageFailure.read(Buffer.from('pdf')), /broken page/u);
  assert.equal(pageFailureDestroyed, true);
});

test('pdfjs reader marks raster image operators without confusing text-only pages', async () => {
  const reader = new PdfJsPageReader(() => ({
    async destroy() {},
    promise: Promise.resolve({
      async getPage(pageNumber) {
        return {
          async getOperatorList() {
            return { fnArray: pageNumber === 2 ? [OPS.paintImageXObject] : [OPS.showText] };
          },
          async getTextContent() {
            return { items: [] };
          },
          getViewport() {
            return { height: 800, width: 600 };
          },
        };
      },
      numPages: 2,
    }),
  }));

  const pages = await reader.read(Buffer.from('pdf'));

  assert.deepEqual(pages.map((page) => page.hasRasterContent), [false, true]);
});

type FakePage = string | { hasRasterContent: boolean; text: string };

function fakePageReader(pageInputs: readonly FakePage[]): PdfPageReader {
  return {
    async read() {
      return pageInputs.map((input, index) => {
        const page = typeof input === 'string'
          ? { hasRasterContent: input === 'weak', text: input }
          : input;
        return {
          hasRasterContent: page.hasRasterContent,
          pageNumber: index + 1,
          text: page.text ? `[PDF page ${index + 1}]\n${page.text}` : '',
        };
      });
    },
  };
}
