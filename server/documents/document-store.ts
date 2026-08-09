import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DocumentProcessingState } from '../../shared/contracts/document-processing.ts';
import { legacyDocumentProcessingSummary } from '../../shared/contracts/document-processing.ts';
import { AppError } from '../errors.ts';
import { DocumentFiles, validateId, type StoredMetadata } from './document-files.ts';
import { extractDocument } from './extract-document.ts';
import type {
  DocumentImportInput,
  DocumentMetadata,
  DocumentResource,
  DocumentResourceKind,
} from './types.ts';

export class DocumentStore {
  private readonly files: DocumentFiles;
  private readonly updates = new Map<string, Promise<void>>();

  constructor(documentDirectory: string, knowledgeDirectory: string) {
    this.files = new DocumentFiles(documentDirectory, knowledgeDirectory);
  }

  async import(input: DocumentImportInput): Promise<DocumentMetadata> {
    const name = safeName(input.name);
    const extracted = await extractDocument(name, input.buffer);
    const id = input.id ? validateId(input.id) : randomUUID();
    const metadata: StoredMetadata = {
      id,
      name,
      sourceFile: `${id}${extracted.extension}`,
      textFile: `${id}.txt`,
      format: extracted.format,
      size: input.buffer.length,
      characterCount: extracted.text.length,
      importedAt: new Date().toISOString(),
      processing: { ...legacyDocumentProcessingSummary },
      processingGeneration: 0,
    };

    await this.files.save(metadata, input.buffer, extracted.text);
    return toPublicMetadata(metadata);
  }

  async list(): Promise<DocumentMetadata[]> {
    const documents = await this.files.list();
    return documents.map(toPublicMetadata).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  }

  async rebuild(id: string): Promise<DocumentMetadata> {
    const stored = await this.files.read(validateId(id));
    const source = await this.files.readSource(stored);
    const extracted = await extractDocument(stored.name, source);
    const rebuilt: StoredMetadata = {
      ...stored,
      characterCount: extracted.text.length,
      format: extracted.format,
      size: source.length,
    };
    await this.files.replaceText(rebuilt, extracted.text);
    return toPublicMetadata(rebuilt);
  }

  async rebuildAll(): Promise<DocumentMetadata[]> {
    const rebuilt: DocumentMetadata[] = [];
    for (const document of await this.files.list()) rebuilt.push(await this.rebuild(document.id));
    return rebuilt;
  }

  async remove(id: string): Promise<void> {
    await this.files.remove(await this.files.read(validateId(id)));
  }

  async resource(id: string, kind: DocumentResourceKind): Promise<DocumentResource> {
    const stored = await this.files.read(validateId(id));
    return {
      metadata: toPublicMetadata(stored),
      path: await this.files.resourcePath(stored, kind),
    };
  }

  async readText(id: string): Promise<string> {
    const stored = await this.files.read(validateId(id));
    return this.files.readText(stored);
  }

  async readSource(id: string): Promise<{ metadata: DocumentMetadata; source: Buffer }> {
    const stored = await this.files.read(validateId(id));
    return { metadata: toPublicMetadata(stored), source: await this.files.readSource(stored) };
  }

  async processingState(id: string): Promise<DocumentProcessingState> {
    const stored = await this.files.read(validateId(id));
    return { generation: stored.processingGeneration, summary: stored.processing };
  }

  async updateProcessing(
    id: string,
    update: (current: DocumentProcessingState) => DocumentProcessingState,
    text?: string,
  ): Promise<DocumentProcessingState> {
    return this.exclusive(validateId(id), async () => {
      const stored = await this.files.read(id);
      const next = update({ generation: stored.processingGeneration, summary: stored.processing });
      const updated: StoredMetadata = {
        ...stored,
        characterCount: text === undefined ? stored.characterCount : text.length,
        processing: next.summary,
        processingGeneration: next.generation,
      };
      if (text === undefined) await this.files.writeMetadata(updated);
      else await this.files.replaceText(updated, text);
      return next;
    });
  }

  private async exclusive<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.updates.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.updates.set(id, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.updates.get(id) === tail) this.updates.delete(id);
    }
  }
}

function safeName(value: string): string {
  const name = basename(value).replace(/[\u0000-\u001F<>:"/\\|?*]/g, '').trim().slice(0, 180);
  if (!name) throw new AppError('INVALID_REQUEST', 'اسم الملف غير صالح.', 400);
  return name;
}

function toPublicMetadata(metadata: StoredMetadata): DocumentMetadata {
  const {
    processingGeneration: _processingGeneration,
    sourceFile: _sourceFile,
    textFile: _textFile,
    ...publicMetadata
  } = metadata;
  return publicMetadata;
}
