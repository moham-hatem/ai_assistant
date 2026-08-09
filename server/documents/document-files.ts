import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  normalizeDocumentProcessingGeneration,
  normalizeDocumentProcessingSummary,
} from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';
import type { DocumentMetadata } from './types.ts';
import type { DocumentResourceKind } from './types.ts';

export interface StoredMetadata extends DocumentMetadata {
  processingGeneration: number;
  sourceFile: string;
  textFile: string;
}

export class DocumentFiles {
  private readonly filesDirectory: string;
  private readonly legacyTextDirectory: string;
  private readonly metadataDirectory: string;
  private readonly textDirectory: string;

  constructor(documentDirectory: string, knowledgeDirectory: string) {
    this.filesDirectory = join(documentDirectory, 'files');
    this.metadataDirectory = join(documentDirectory, 'metadata');
    this.textDirectory = join(documentDirectory, 'text');
    this.legacyTextDirectory = join(knowledgeDirectory, 'imported');
  }

  async save(metadata: StoredMetadata, source: Buffer, text: string): Promise<void> {
    await this.ensureDirectories();
    const paths = this.paths(metadata);
    const created: string[] = [];

    try {
      await writeFile(paths.source, source, { flag: 'wx' });
      created.push(paths.source);
      await writeFile(paths.text, text, { encoding: 'utf8', flag: 'wx' });
      created.push(paths.text);
      await atomicWrite(paths.metadata, JSON.stringify(metadata, null, 2));
      created.push(paths.metadata);
    } catch (error) {
      // A failed initial import has no metadata through which an orphan could be recovered.
      await Promise.allSettled(created.map((path) => rm(path, { force: true })));
      throw error;
    }
  }

  async list(): Promise<StoredMetadata[]> {
    await this.ensureDirectories();
    const entries = await readdir(this.metadataDirectory);
    return Promise.all(
      entries.filter((entry) => entry.endsWith('.json')).map((entry) => this.read(entry.slice(0, -5))),
    );
  }

  async read(id: string): Promise<StoredMetadata> {
    try {
      return normalizeStoredMetadata(JSON.parse(await readFile(this.metadataPath(id), 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('DOCUMENT_NOT_FOUND', 'الملف غير موجود.', 404);
      }
      throw error;
    }
  }

  async remove(metadata: StoredMetadata): Promise<void> {
    await Promise.all([
      ...Object.values(this.paths(metadata)).map((path) => rm(path, { force: true })),
      rm(this.legacyTextPath(metadata), { force: true }),
    ]);
  }

  async readSource(metadata: StoredMetadata): Promise<Buffer> {
    return readFile(this.paths(metadata).source);
  }

  async replaceText(metadata: StoredMetadata, text: string): Promise<void> {
    await this.ensureDirectories();
    const paths = this.paths(metadata);
    await atomicWrite(paths.text, text);
    await atomicWrite(paths.metadata, JSON.stringify(metadata, null, 2));
    await rm(this.legacyTextPath(metadata), { force: true });
  }

  async writeMetadata(metadata: StoredMetadata): Promise<void> {
    await this.ensureDirectories();
    await atomicWrite(this.paths(metadata).metadata, JSON.stringify(metadata, null, 2));
  }

  async readText(metadata: StoredMetadata): Promise<string> {
    return readFile(await this.textPath(metadata), 'utf8');
  }

  async resourcePath(metadata: StoredMetadata, kind: DocumentResourceKind): Promise<string> {
    const paths = this.paths(metadata);
    return kind === 'source' ? paths.source : this.textPath(metadata);
  }

  private async ensureDirectories() {
    await Promise.all([
      mkdir(this.filesDirectory, { recursive: true }),
      mkdir(this.metadataDirectory, { recursive: true }),
      mkdir(this.textDirectory, { recursive: true }),
    ]);
  }

  private paths(metadata: StoredMetadata) {
    return {
      source: join(this.filesDirectory, metadata.sourceFile),
      text: join(this.textDirectory, metadata.textFile),
      metadata: this.metadataPath(metadata.id),
    };
  }

  private async textPath(metadata: StoredMetadata): Promise<string> {
    const current = this.paths(metadata).text;
    try {
      await access(current);
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return this.legacyTextPath(metadata);
    }
  }

  private legacyTextPath(metadata: StoredMetadata): string {
    return join(this.legacyTextDirectory, metadata.textFile);
  }

  private metadataPath(id: string) {
    return join(this.metadataDirectory, `${validateId(id)}.json`);
  }
}

function normalizeStoredMetadata(value: unknown): StoredMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyntaxError('Document metadata must be a JSON object.');
  }
  const metadata = value as StoredMetadata & Record<string, unknown>;
  return {
    ...metadata,
    processing: normalizeDocumentProcessingSummary(metadata.processing),
    processingGeneration: normalizeDocumentProcessingGeneration(metadata.processingGeneration),
  };
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export function validateId(id: string): string {
  const valid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
  if (!valid) throw new AppError('DOCUMENT_NOT_FOUND', 'الملف غير موجود.', 404);
  return id;
}
