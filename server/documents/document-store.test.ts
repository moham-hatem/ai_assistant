import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    const extracted = await readFile(join(knowledge, 'imported', `${imported.id}.txt`), 'utf8');

    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'lesson.txt');
    assert.match(extracted, /محتوى تعليمي/);

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
