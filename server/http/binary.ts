import type { IncomingMessage } from 'node:http';
import {
  DOCUMENT_SIZE_ERROR_MESSAGE,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../../shared/document-limits.ts';
import { AppError } from '../errors.ts';

export async function readBinary(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_DOCUMENT_SIZE_BYTES) {
      throw new AppError('REQUEST_TOO_LARGE', DOCUMENT_SIZE_ERROR_MESSAGE, 413);
    }
    chunks.push(buffer);
  }

  if (size === 0) throw new AppError('INVALID_REQUEST', 'اختر ملفًا غير فارغ.', 400);
  return Buffer.concat(chunks);
}
