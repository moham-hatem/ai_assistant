import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentExtractor } from '../types.ts';
import { extractLayoutAwarePage } from './pdf-layout.ts';

export class PdfExtractor implements DocumentExtractor {
  async extract(buffer: Buffer): Promise<string> {
    const loadingTask = getDocument({ data: new Uint8Array(buffer) });
    const document = await loadingTask.promise;
    const pages: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const text = extractLayoutAwarePage(
          content.items.filter(
            (item): item is typeof item & { str: string; transform: number[] } =>
              'str' in item && 'transform' in item,
          ),
          { height: viewport.height, pageNumber, width: viewport.width },
        );
        if (text) pages.push(text);
      }
    } finally {
      await loadingTask.destroy();
    }

    return pages.join('\n\n');
  }
}
