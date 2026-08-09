import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const featureDirectory = join(process.cwd(), 'src/features/admin/quality-metrics');

test('quality metrics UI sources keep valid Unicode and no mojibake markers', async () => {
  const files = await sourceFiles(featureDirectory);
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /Â|â|Ø/u);
  assert.match(combined, /العربية/u);
  assert.match(combined, /·/u);
  assert.match(combined, /−/u);
  assert.match(combined, /—/u);
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}
