import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
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

  constructor(documentDirectory: string, knowledgeDirectory: string) {
    this.files = new DocumentFiles(documentDirectory, knowledgeDirectory);
  }

  async import(input: DocumentImportInput): Promise<DocumentMetadata> {
    const name = safeName(input.name);
    const extracted = await extractDocument(name, input.buffer);
    const id = randomUUID();
    const metadata: StoredMetadata = {
      id,
      name,
      sourceFile: `${id}${extracted.extension}`,
      textFile: `${id}.txt`,
      format: extracted.format,
      size: input.buffer.length,
      characterCount: extracted.text.length,
      importedAt: new Date().toISOString(),
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
      path: this.files.resourcePath(stored, kind),
    };
  }
}

function safeName(value: string): string {
  const name = basename(value).replace(/[\u0000-\u001F<>:"/\\|?*]/g, '').trim().slice(0, 180);
  if (!name) throw new AppError('INVALID_REQUEST', 'اسم الملف غير صالح.', 400);
  return name;
}

function toPublicMetadata(metadata: StoredMetadata): DocumentMetadata {
  const { sourceFile: _sourceFile, textFile: _textFile, ...publicMetadata } = metadata;
  return publicMetadata;
}
