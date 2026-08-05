import type { Evidence, KnowledgeResult, KnowledgeSource } from '../domain.ts';
import { loadLocalEvidence } from './file-loader.ts';
import { expandWithNeighborEvidence } from './neighbor-evidence.ts';
import { rankEvidence } from './rank-evidence.ts';
import type { SemanticSearch } from './semantic-search.ts';

export class LocalKnowledgeSource implements KnowledgeSource {
  private readonly directory: string;
  private readonly semantic?: SemanticSearch;

  constructor(directory: string, semantic?: SemanticSearch) {
    this.directory = directory;
    this.semantic = semantic;
  }

  async search(question: string, limit: number, alternatives: string[] = []): Promise<KnowledgeResult> {
    const { chunks, fileCount } = await loadLocalEvidence(this.directory);
    if (!this.semantic || chunks.length === 0) {
      const ranked = rankEvidence(chunks, combinedQuery(question, alternatives), limit);
      return { evidence: expandWithNeighborEvidence(chunks, ranked, limit), fileCount };
    }

    try {
      const ranked = await this.semantic.rank(chunks, question, limit, alternatives);
      const whyQuestion = /(?:لماذا|ليه|why|kwa\s+nini|kwanini)/iu.test(question);
      const seeds = whyQuestion ? selectDominantSource(ranked) : ranked;
      const expanded = expandWithNeighborEvidence(chunks, seeds, limit);
      if (whyQuestion) {
        const focused = await this.semantic.focus(
          expanded,
          question,
          Math.min(limit, 4),
          alternatives,
        );
        if (focused.length > 0) return { evidence: focused, fileCount };
      }
      return { evidence: expanded, fileCount };
    } catch (error) {
      console.warn('Semantic search unavailable; using lexical fallback.', error);
      const ranked = rankEvidence(chunks, combinedQuery(question, alternatives), limit);
      return { evidence: expandWithNeighborEvidence(chunks, ranked, limit), fileCount };
    }
  }

  async prepare(): Promise<{ chunkCount: number; fileCount: number }> {
    const loaded = await loadLocalEvidence(this.directory);
    if (this.semantic) await this.semantic.prepare(loaded.chunks);
    return { chunkCount: loaded.chunks.length, fileCount: loaded.fileCount };
  }
}

export function selectDominantSource(ranked: Evidence[]): Evidence[] {
  const candidates = ranked.slice(0, 6);
  const scores = new Map<string, number>();
  candidates.forEach((item, index) => {
    const source = sourceFile(item.id);
    scores.set(source, (scores.get(source) ?? 0) + candidates.length - index);
  });
  const winner = [...scores.entries()]
    .sort((first, second) => second[1] - first[1])[0]?.[0];
  return winner ? ranked.filter((item) => sourceFile(item.id) === winner) : ranked;
}

function sourceFile(id: string): string {
  return id.replace(/#.*$/u, '').replace(/:\d+$/u, '');
}

function combinedQuery(question: string, alternatives: string[]): string {
  return [question, ...alternatives].join(' ');
}
