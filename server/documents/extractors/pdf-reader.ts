import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLayoutAwarePage } from './pdf-layout.ts';

interface PdfTextContentItem {
  str: string;
  transform: number[];
}

interface PdfPageHandle {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(options: { scale: number }): { height: number; width: number };
}

interface PdfDocumentHandle {
  getPage(pageNumber: number): Promise<PdfPageHandle>;
  numPages: number;
}

interface PdfLoadingTask {
  destroy(): Promise<void>;
  promise: Promise<PdfDocumentHandle>;
}

export type PdfLoadingTaskFactory = (buffer: Buffer) => PdfLoadingTask;

export interface NativePdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfPageReader {
  read(buffer: Buffer): Promise<NativePdfPage[]>;
}

export class PdfJsPageReader implements PdfPageReader {
  private readonly load: PdfLoadingTaskFactory;

  constructor(load: PdfLoadingTaskFactory = loadPdf) {
    this.load = load;
  }

  async read(buffer: Buffer): Promise<NativePdfPage[]> {
    const loadingTask = this.load(buffer);
    const pages: NativePdfPage[] = [];

    try {
      const document = await loadingTask.promise;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        pages.push({
          pageNumber,
          text: extractLayoutAwarePage(content.items.filter(isPdfTextContentItem), {
            height: viewport.height,
            pageNumber,
            width: viewport.width,
          }),
        });
      }
    } finally {
      await loadingTask.destroy();
    }

    return pages;
  }
}

function loadPdf(buffer: Buffer): PdfLoadingTask {
  const task = getDocument({ data: new Uint8Array(buffer) });
  return {
    destroy: () => task.destroy(),
    promise: task.promise as Promise<PdfDocumentHandle>,
  };
}

function isPdfTextContentItem(item: unknown): item is PdfTextContentItem {
  return typeof item === 'object'
    && item !== null
    && 'str' in item
    && typeof item.str === 'string'
    && 'transform' in item
    && Array.isArray(item.transform);
}
