import type { IncomingMessage } from 'node:http';

export class AccessHttpInputError extends Error {}

export function matchAccessPath(pathname: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(pathname);
  return match ? decodeAccessPathSegment(match[1]) : undefined;
}

export function decodeAccessPathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AccessHttpInputError();
  }
}

export function requireOnlyAccessQuery(url: URL, allowed: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new AccessHttpInputError();
    }
  }
}

export async function requireEmptyAccessJson(request: IncomingMessage): Promise<void> {
  const body = await readStrictAccessJson(request, []);
  if (Object.keys(body).length !== 0) throw new AccessHttpInputError();
}

export async function readStrictAccessJson(
  request: IncomingMessage,
  allowedKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new AccessHttpInputError();
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && (declared < 0 || declared > 4_096)) {
    throw new AccessHttpInputError();
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 4_096) throw new AccessHttpInputError();
    chunks.push(bytes);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AccessHttpInputError();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AccessHttpInputError();
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new AccessHttpInputError();
  }
  return record;
}
