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

  const text = (await selected.extractor.extract(buffer)).trim();
  if (text.length < 20) {
    throw new AppError('INVALID_REQUEST', 'لم أجد نصًا كافيًا داخل الملف.', 400);
  }

  return { extension, format: selected.format, text };
}
