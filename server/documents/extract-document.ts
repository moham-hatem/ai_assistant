import { extname } from 'node:path';
import { AppError } from '../errors.ts';
import { DocxExtractor } from './extractors/docx.ts';
import { PdfExtractor } from './extractors/pdf.ts';
import { TextExtractor } from './extractors/text.ts';
import type { DocumentExtractor, DocumentFormat } from './types.ts';

const textExtractor = new TextExtractor();
const extractors = new Map<string, { extractor: DocumentExtractor; format: DocumentFormat }>([
  ['.docx', { extractor: new DocxExtractor(), format: 'docx' }],
  ['.md', { extractor: textExtractor, format: 'markdown' }],
  ['.pdf', { extractor: new PdfExtractor(), format: 'pdf' }],
  ['.txt', { extractor: textExtractor, format: 'text' }],
]);

export async function extractDocument(name: string, buffer: Buffer) {
  const extension = extname(name).toLowerCase();
  const selected = extractors.get(extension);
  if (!selected) {
    throw new AppError('INVALID_REQUEST', 'الصيغة المدعومة هي TXT أو Markdown أو PDF أو DOCX.', 400);
  }

  let text: string;
  try {
    text = (await selected.extractor.extract(buffer)).trim();
  } catch (error) {
    throw extractionFailed(error);
  }
  if (text.length < 20) {
    throw extractionFailed();
  }

  return { extension, format: selected.format, text };
}

function extractionFailed(cause?: unknown): AppError {
  return new AppError(
    'DOCUMENT_EXTRACTION_FAILED',
    'تعذر استخراج نص كافٍ من الملف.',
    422,
    cause === undefined ? undefined : { cause },
  );
}
