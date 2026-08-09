import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DocumentStore } from '../../documents/document-store.ts';
import type { StoredMetadata } from '../../documents/document-files.ts';
import { LocalKnowledgeSource } from '../../knowledge/local-knowledge.ts';
import { BookDocumentEvidenceSource } from './book-document-evidence.ts';
import { BookDocumentService } from './book-document-service.ts';
import { BookService } from './book-service.ts';
import { createDocumentReference } from './document-reference.ts';
import { SqliteBookRepository } from './sqlite-book-repository.ts';

test('grandfathered metadata loads a legacy imported document', async () => {
  await withContext(async (context) => {
    const document = await writeLegacyDocument(context, 'legacy-metadata-marker');
    const result = await context.knowledge.search('legacy-metadata-marker', 3);

    assert.equal(result.fileCount, 1);
    assert.equal(result.evidence.length, 1);
    assert.match(result.evidence[0]?.id ?? '', new RegExp(`^legacy/documents/${document.id}:1$`, 'u'));
  });
});

test('rebuilding a grandfathered document keeps it searchable from staged text', async () => {
  await withContext(async (context) => {
    const document = await writeLegacyDocument(context, 'legacy-rebuild-marker');
    await context.documents.rebuild(document.id);

    await access(join(context.documentDirectory, 'text', `${document.id}.txt`));
    await assert.rejects(access(join(context.knowledgeDirectory, 'imported', `${document.id}.txt`)));
    assert.match(
      (await context.knowledge.search('legacy-rebuild-marker', 3)).evidence[0]?.content ?? '',
      /legacy-rebuild-marker/u,
    );
  });
});

test('documents linked to draft or ready editions never enter through legacy compatibility', async () => {
  await withContext(async (context) => {
    const book = await context.books.createBook({ language: 'en', title: 'Unpublished links' });
    const draftDocument = await context.documents.import({
      buffer: content('linked-draft-marker'),
      name: 'draft.txt',
    });
    await context.books.addEdition({
      bookId: book.id,
      contentHash: 'd'.repeat(64),
      originalDocumentReference: createDocumentReference(draftDocument.id),
      version: 'draft',
    });
    await context.application.upload({
      bookId: book.id,
      buffer: content('linked-ready-marker'),
      name: 'ready.txt',
      version: 'ready',
    });

    assert.equal((await context.knowledge.search('linked-draft-marker', 3)).evidence.length, 0);
    assert.equal((await context.knowledge.search('linked-ready-marker', 3)).evidence.length, 0);
  });
});

test('a published linked document is loaded once through its edition identity', async () => {
  await withContext(async (context) => {
    const book = await context.books.createBook({ language: 'en', title: 'Published link' });
    const uploaded = await context.application.upload({
      bookId: book.id,
      buffer: content('published-once-marker'),
      name: 'published.txt',
      version: 'v1',
    });
    await context.application.transitionEdition(book.id, uploaded.edition.id, 'published');

    const loaded = await context.evidence.load();
    const matches = loaded.chunks.filter((chunk) => chunk.content.includes('published-once-marker'));
    assert.equal(matches.length, 1);
    assert.match(matches[0]?.id ?? '', /^books\/.+\/editions\/.+:1$/u);
    assert.doesNotMatch(matches[0]?.id ?? '', /^legacy\//u);
  });
});

test('archived and rejected linked documents cannot leak through legacy compatibility', async () => {
  await withContext(async (context) => {
    const book = await context.books.createBook({ language: 'en', title: 'Inactive links' });
    const archived = await context.application.upload({
      bookId: book.id,
      buffer: content('linked-archived-marker'),
      name: 'archived.txt',
      version: 'archived',
    });
    await context.application.transitionEdition(book.id, archived.edition.id, 'published');
    await context.application.transitionEdition(book.id, archived.edition.id, 'archived');
    const rejected = await context.application.upload({
      bookId: book.id,
      buffer: content('linked-rejected-marker'),
      name: 'rejected.txt',
      version: 'rejected',
    });
    await context.application.transitionEdition(book.id, rejected.edition.id, 'rejected');

    assert.equal((await context.knowledge.search('linked-archived-marker', 3)).evidence.length, 0);
    assert.equal((await context.knowledge.search('linked-rejected-marker', 3)).evidence.length, 0);
  });
});

test('raw imported text without DocumentStore metadata remains excluded', async () => {
  await withContext(async (context) => {
    const imported = join(context.knowledgeDirectory, 'imported');
    await mkdir(imported, { recursive: true });
    await writeFile(join(imported, 'orphan.txt'), content('raw-orphan-marker'));

    const result = await context.knowledge.search('raw-orphan-marker', 3);
    assert.equal(result.fileCount, 0);
    assert.equal(result.evidence.length, 0);
  });
});

interface TestContext {
  application: BookDocumentService;
  books: BookService;
  documentDirectory: string;
  documents: DocumentStore;
  evidence: BookDocumentEvidenceSource;
  knowledge: LocalKnowledgeSource;
  knowledgeDirectory: string;
}

async function withContext(run: (context: TestContext) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'book-document-evidence-test-'));
  const documentDirectory = join(root, 'documents');
  const knowledgeDirectory = join(root, 'knowledge');
  const repository = new SqliteBookRepository(join(root, 'books.sqlite'));
  const documents = new DocumentStore(documentDirectory, knowledgeDirectory);
  const books = new BookService(repository);
  const application = new BookDocumentService(books, repository, documents);
  const evidence = new BookDocumentEvidenceSource(repository, documents);
  const knowledge = new LocalKnowledgeSource(knowledgeDirectory, undefined, evidence);

  try {
    await run({
      application,
      books,
      documentDirectory,
      documents,
      evidence,
      knowledge,
      knowledgeDirectory,
    });
  } finally {
    repository.close();
    await rm(root, { recursive: true, force: true });
  }
}

async function writeLegacyDocument(
  context: TestContext,
  marker: string,
): Promise<StoredMetadata> {
  const id = crypto.randomUUID();
  const text = content(marker).toString('utf8');
  const metadata: StoredMetadata = {
    characterCount: text.length,
    format: 'text',
    id,
    importedAt: '2026-08-06T10:00:00.000Z',
    name: 'legacy.txt',
    processing: {
      averageConfidence: null,
      failureCode: null,
      lowConfidencePageCount: 0,
      method: 'native',
      ocrPageCount: 0,
      pageCount: 0,
      processedAt: null,
      status: 'ready',
    },
    processingGeneration: 0,
    size: Buffer.byteLength(text),
    sourceFile: `${id}.txt`,
    textFile: `${id}.txt`,
  };
  await Promise.all([
    mkdir(join(context.documentDirectory, 'files'), { recursive: true }),
    mkdir(join(context.documentDirectory, 'metadata'), { recursive: true }),
    mkdir(join(context.knowledgeDirectory, 'imported'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(context.documentDirectory, 'files', metadata.sourceFile), text, 'utf8'),
    writeFile(
      join(context.documentDirectory, 'metadata', `${id}.json`),
      JSON.stringify(metadata),
      'utf8',
    ),
    writeFile(join(context.knowledgeDirectory, 'imported', metadata.textFile), text, 'utf8'),
  ]);
  return metadata;
}

function content(marker: string): Buffer {
  return Buffer.from(`Trusted legacy educational content includes ${marker} for retrieval.`, 'utf8');
}
