import type { Evidence } from '../domain.ts';

export interface PublishedEvidenceSource {
  load(): Promise<{ chunks: Evidence[]; fileCount: number }>;
}
