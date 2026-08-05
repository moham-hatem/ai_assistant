import type { DocumentExtractor } from '../types.ts';

export class TextExtractor implements DocumentExtractor {
  async extract(buffer: Buffer): Promise<string> {
    return buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  }
}
