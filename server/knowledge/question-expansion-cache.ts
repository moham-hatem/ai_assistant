import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

type ExpansionData = Record<string, string[]>;

export class QuestionExpansionCache {
  private memory?: ExpansionData;
  private readonly path: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  async get(question: string): Promise<string[] | undefined> {
    return (await this.load())[key(question)];
  }

  async set(question: string, alternatives: string[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const data = await this.load();
      data[key(question)] = alternatives;
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
      await rename(temporaryPath, this.path);
    });
    return this.writeQueue;
  }

  private async load(): Promise<ExpansionData> {
    if (this.memory) return this.memory;
    try {
      this.memory = JSON.parse(await readFile(this.path, 'utf8')) as ExpansionData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Question expansion cache could not be read; starting empty.');
      }
      this.memory = {};
    }
    return this.memory;
  }
}

function key(question: string): string {
  const normalized = question.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(`3:${normalized}`).digest('hex');
}
