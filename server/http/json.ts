import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppError } from '../errors.ts';

const maximumBodySize = 16_384;

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export async function discardRequestBody(request: IncomingMessage): Promise<void> {
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
    if (size > maximumBodySize) {
      throw new AppError('REQUEST_TOO_LARGE', 'Request body is too large.', 413);
    }
  }
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodySize) {
      throw new AppError('REQUEST_TOO_LARGE', 'حجم الطلب أكبر من المسموح.', 413);
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AppError('INVALID_REQUEST', 'صيغة الطلب غير صحيحة.', 400);
  }
}
