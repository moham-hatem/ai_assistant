import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Evidence } from '../domain.ts';
import { chunkText } from './chunk-text.ts';

const supportedExtensions = new Set(['.md', '.txt']);

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(currentDirectory: string) {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const path = join(currentDirectory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (supportedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
    }
  }

  try {
    await visit(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return files.sort();
}

export async function loadLocalEvidence(
  directory: string,
): Promise<{ chunks: Evidence[]; fileCount: number }> {
  const files = await listFiles(directory);
  const chunks: Evidence[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    chunkText(content).forEach((text, index) => {
      chunks.push({ id: `${relative(directory, file)}:${index + 1}`, content: text });
    });
  }

  return { chunks, fileCount: files.length };
}
