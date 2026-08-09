import type { Evidence } from '../domain.ts';
import { loadLocalEvidence } from './file-loader.ts';
import type { PublishedEvidenceSource } from './published-evidence-source.ts';

export class LocalPublishedEvidenceSource implements PublishedEvidenceSource {
  private readonly directory: string;
  private readonly managed: PublishedEvidenceSource;

  constructor(directory: string, managed: PublishedEvidenceSource) {
    this.directory = directory;
    this.managed = managed;
  }

  async load(): Promise<{ chunks: Evidence[]; fileCount: number }> {
    const [local, managed] = await Promise.all([
      loadLocalEvidence(this.directory, { excludedRootDirectories: ['imported'] }),
      this.managed.load(),
    ]);
    return {
      chunks: [...local.chunks, ...managed.chunks],
      fileCount: local.fileCount + managed.fileCount,
    };
  }
}
