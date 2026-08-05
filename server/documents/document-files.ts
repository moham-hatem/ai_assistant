import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../errors.ts';
import type { DocumentMetadata } from './types.ts';
import type { DocumentResourceKind } from './types.ts';

export interface StoredMetadata extends DocumentMetadata {
  sourceFile: string;
  textFile: string;
}

export class DocumentFiles {
  private readonly filesDirectory: string;
  private readonly metadataDirectory: string;
  private readonly textDirectory: string;

  constructor(documentDirectory: string, knowledgeDirectory: string) {
    this.filesDirectory = join(documentDirectory, 'files');
    this.metadataDirectory = join(documentDirectory, 'metadata');
    this.textDirectory = join(knowledgeDirectory, 'imported');
  }

  async save(metadata: StoredMetadata, source: Buffer, text: string): Promise<void> {
    await this.ensureDirectories();
    const paths = this.paths(metadata);

    try {
      await Promise.all([
        writeFile(paths.source, source),
        writeFile(paths.text, text, 'utf8'),
        writeFile(paths.metadata, JSON.stringify(metadata, null, 2), 'utf8'),
      ]);
    } catch (error) {
      await Promise.all(Object.values(paths).map((path) => rm(path, { force: true })));
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
      return JSON.parse(await readFile(this.metadataPath(id), 'utf8')) as StoredMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('DOCUMENT_NOT_FOUND', 'الملف غير موجود.', 404);
      }
      throw error;
    }
  }

  async remove(metadata: StoredMetadata): Promise<void> {
    await Promise.all(Object.values(this.paths(metadata)).map((path) => rm(path, { force: true })));
  }

  async readSource(metadata: StoredMetadata): Promise<Buffer> {
    return readFile(this.paths(metadata).source);
  }

  async replaceText(metadata: StoredMetadata, text: string): Promise<void> {
    await this.ensureDirectories();
    const paths = this.paths(metadata);
    await Promise.all([
      writeFile(paths.text, text, 'utf8'),
      writeFile(paths.metadata, JSON.stringify(metadata, null, 2), 'utf8'),
    ]);
  }

  resourcePath(metadata: StoredMetadata, kind: DocumentResourceKind): string {
    const paths = this.paths(metadata);
    return kind === 'source' ? paths.source : paths.text;
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

  private metadataPath(id: string) {
    return join(this.metadataDirectory, `${validateId(id)}.json`);
  }
}

export function validateId(id: string): string {
  const valid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
  if (!valid) throw new AppError('DOCUMENT_NOT_FOUND', 'الملف غير موجود.', 404);
  return id;
}
