import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../errors.ts';

interface FileResponse {
  contentType: string;
  name: string;
  path: string;
}

export async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: FileResponse,
) {
  const size = (await stat(file.path)).size;
  const range = parseRange(request.headers.range, size);

  response.statusCode = range ? 206 : 200;
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Disposition', `inline; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  response.setHeader('Content-Length', range ? range.end - range.start + 1 : size);
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (range) response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  await pipeline(createReadStream(file.path, range), response);
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return undefined;
  const match = value.match(/^bytes=(\d+)-(\d*)$/);
  const start = Number(match?.[1]);
  const requestedEnd = match?.[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);

  if (!match || !Number.isSafeInteger(start) || start < 0 || start > end) {
    throw new AppError('INVALID_REQUEST', 'نطاق الملف المطلوب غير صالح.', 416);
  }
  return { start, end };
}
