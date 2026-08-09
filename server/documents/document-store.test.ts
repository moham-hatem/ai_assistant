import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DocumentStore } from './document-store.ts';

test('document store imports, lists and removes local text documents', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-store-test-'));
  const documents = join(root, 'documents');
  const knowledge = join(root, 'knowledge');
  const store = new DocumentStore(documents, knowledge);

  try {
    const imported = await store.import({
      name: 'lesson.txt',
      buffer: Buffer.from('محتوى تعليمي موثوق وكاف لاختبار عملية الاستيراد المحلية.', 'utf8'),
    });
    const list = await store.list();
    const extracted = await readFile(join(documents, 'text', `${imported.id}.txt`), 'utf8');

    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'lesson.txt');
    assert.deepEqual(list[0].processing, {
      averageConfidence: null,
      failureCode: null,
      lowConfidencePageCount: 0,
      method: 'native',
      ocrPageCount: 0,
      pageCount: 0,
      processedAt: null,
      status: 'ready',
    });
    assert.match(extracted, /محتوى تعليمي/);
    await assert.rejects(readFile(join(knowledge, 'imported', `${imported.id}.txt`), 'utf8'));

    const source = await store.resource(imported.id, 'source');
    const text = await store.resource(imported.id, 'text');
    assert.equal((await readFile(source.path, 'utf8')).length, imported.characterCount);
    assert.equal((await readFile(text.path, 'utf8')).length, imported.characterCount);

    const replacement = 'Updated local educational content with enough detail to rebuild the document safely.';
    await writeFile(source.path, replacement, 'utf8');
    const rebuilt = await store.rebuild(imported.id);
    assert.equal(await readFile(text.path, 'utf8'), replacement);
    assert.equal(rebuilt.characterCount, replacement.length);

    await store.remove(imported.id);
    assert.deepEqual(await store.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy metadata is normalized and preserved when rewritten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-store-legacy-test-'));
  const documents = join(root, 'documents');
  const store = new DocumentStore(documents, join(root, 'knowledge'));
  try {
    const imported = await store.import({
      name: 'legacy.txt',
      buffer: Buffer.from('Legacy educational text with sufficient content for extraction.'),
    });
    const metadataPath = join(documents, 'metadata', `${imported.id}.json`);
    const raw = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
    delete raw.processing;
    delete raw.processingGeneration;
    raw.legacyExtension = { retained: true };
    await writeFile(metadataPath, JSON.stringify(raw), 'utf8');

    const [normalized] = await store.list();
    assert.equal(normalized.processing.status, 'ready');
    assert.equal(normalized.processing.method, 'native');
    assert.equal((await store.processingState(imported.id)).generation, 0);

    await store.updateProcessing(imported.id, (current) => ({
      generation: current.generation + 1,
      summary: { ...current.summary, status: 'processing' },
    }));
    const rewritten = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(rewritten.legacyExtension, { retained: true });
    assert.equal(rewritten.processingGeneration, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed initial metadata write cleans up source and text orphans', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-store-failed-import-test-'));
  const documents = join(root, 'documents');
  const id = crypto.randomUUID();
  const store = new DocumentStore(documents, join(root, 'knowledge'));
  try {
    await mkdir(join(documents, 'metadata', `${id}.json`), { recursive: true });
    await assert.rejects(store.import({
      id,
      name: 'orphan.txt',
      buffer: Buffer.from('Import content long enough to reach the persistence operation.'),
    }));
    await assert.rejects(access(join(documents, 'files', `${id}.txt`)));
    await assert.rejects(access(join(documents, 'text', `${id}.txt`)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
