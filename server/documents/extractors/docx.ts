import * as mammoth from 'mammoth';
import type { DocumentExtractor } from '../types.ts';

export class DocxExtractor implements DocumentExtractor {
  async extract(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
}
