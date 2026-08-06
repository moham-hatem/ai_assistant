import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Evidence } from '../domain.ts';
import { chunkText } from './chunk-text.ts';

const supportedExtensions = new Set(['.md', '.txt']);

async function listFiles(directory: string, excludedRootDirectories: Set<string>): Promise<string[]> {
  const files: string[] = [];

  async function visit(currentDirectory: string) {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      if (currentDirectory === directory && entry.isDirectory()
        && excludedRootDirectories.has(entry.name)) continue;
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
  options: { excludedRootDirectories?: readonly string[] } = {},
): Promise<{ chunks: Evidence[]; fileCount: number }> {
  const files = await listFiles(directory, new Set(options.excludedRootDirectories));
  const chunks: Evidence[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    chunkText(content).forEach((text, index) => {
      chunks.push({ id: `${relative(directory, file)}:${index + 1}`, content: text });
    });
  }

  return { chunks, fileCount: files.length };
}
