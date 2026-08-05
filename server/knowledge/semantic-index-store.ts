import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Evidence } from '../domain.ts';

interface CachedVector {
  id: string;
  vector: number[];
}
export interface SemanticIndex {
  modelId: string;
  signature: string;
  vectors: CachedVector[];
}

export class SemanticIndexStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  signature(chunks: Evidence[]): string {
    const hash = createHash('sha256');
    chunks.forEach((chunk) => hash.update(chunk.id).update('\0').update(chunk.content).update('\0'));
    return hash.digest('hex');
  }

  async read(modelId: string, signature: string): Promise<SemanticIndex | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as SemanticIndex;
      return isValid(parsed, modelId, signature) ? parsed : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      return undefined;
    }
  }

  async write(index: SemanticIndex): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(index), 'utf8');
    await rename(temporary, this.path);
  }
}

function isValid(value: SemanticIndex, modelId: string, signature: string): boolean {
  return value?.modelId === modelId
    && value.signature === signature
    && Array.isArray(value.vectors)
    && value.vectors.every((item) => typeof item.id === 'string' && Array.isArray(item.vector));
}
