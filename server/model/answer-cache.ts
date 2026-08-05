import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AnswerInput, AnswerResult, Evidence } from '../domain.ts';

interface CacheEntry extends AnswerResult {
  createdAt: string;
}

type CacheData = Record<string, CacheEntry>;

export class AnswerCache {
  private memory?: CacheData;
  private readonly path: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  async get(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult | undefined> {
    const entry = (await this.load())[cacheKey(input, evidence)];
    return entry ? { answer: entry.answer, grounded: entry.grounded } : undefined;
  }

  async set(input: AnswerInput, evidence: Evidence[], result: AnswerResult): Promise<void> {
    if (!result.grounded) return;
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.load();
      data[cacheKey(input, evidence)] = { ...result, createdAt: new Date().toISOString() };
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await rename(temporaryPath, this.path);
    });
    return this.writeQueue;
  }

  async delete(input: AnswerInput, evidence: Evidence[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.load();
      const key = cacheKey(input, evidence);
      if (!(key in data)) return;
      delete data[key];
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await rename(temporaryPath, this.path);
    });
    return this.writeQueue;
  }

  private async load(): Promise<CacheData> {
    if (this.memory) return this.memory;
    try {
      this.memory = JSON.parse(await readFile(this.path, 'utf8')) as CacheData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Answer cache could not be read; starting with an empty cache.');
      }
      this.memory = {};
    }
    return this.memory;
  }
}

function cacheKey(input: AnswerInput, evidence: Evidence[]): string {
  const payload = JSON.stringify({
    answerPolicyVersion: 7,
    evidence: evidence.map((item) => ({ content: item.content, id: item.id })),
    language: input.language,
    question: input.question.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(),
  });
  return createHash('sha256').update(payload).digest('hex');
}
