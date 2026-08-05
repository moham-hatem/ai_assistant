import { join } from 'node:path';
import type { Evidence } from '../domain.ts';
import type { TextEmbedder } from './embedding.ts';
import { normalizeArabic, tokenize } from './arabic-text.ts';
import { expandKnowledgeQuery } from './query-expansion.ts';
import { rankSemanticEvidence, type EmbeddedEvidence } from './semantic-rank.ts';
import { SemanticIndexStore, type SemanticIndex } from './semantic-index-store.ts';

export class SemanticSearch {
  private readonly embedder: TextEmbedder;
  private readonly minimumScore: number;
  private readonly store: SemanticIndexStore;
  private memory?: SemanticIndex;
  private pending?: { signature: string; task: Promise<SemanticIndex> };

  constructor(
    embedder: TextEmbedder,
    knowledgeDirectory: string,
    minimumScore: number,
  ) {
    this.embedder = embedder;
    this.minimumScore = minimumScore;
    this.store = new SemanticIndexStore(join(knowledgeDirectory, '.semantic-index', 'index.json'));
  }

  async rank(
    chunks: Evidence[],
    question: string,
    limit: number,
    alternatives: string[] = [],
  ): Promise<Evidence[]> {
    const index = await this.ensureIndex(chunks);
    const queryTexts = [...new Set([...expandKnowledgeQuery(question), ...alternatives])];
    const queries = await this.embedder.embed(queryTexts, 'query');
    const content = new Map(chunks.map((chunk) => [chunk.id, chunk.content]));
    const items = index.vectors.flatMap<EmbeddedEvidence>((item) => {
      const text = content.get(item.id);
      return text ? [{ id: item.id, content: text, vector: item.vector }] : [];
    });
    return rankSemanticEvidence(items, queries, limit, this.minimumScore, question, alternatives);
  }

  async prepare(chunks: Evidence[]): Promise<void> {
    await this.ensureIndex(chunks);
  }

  async focus(
    evidence: Evidence[],
    question: string,
    limit: number,
    alternatives: string[] = [],
  ): Promise<Evidence[]> {
    const passages = focusPassages(evidence);
    if (passages.length === 0) return [];
    const queries = await this.embedder.embed([...new Set([question, ...alternatives])], 'query');
    const queryTexts = [question, ...alternatives];
    const vectors = await this.embedder.embed(passages.map((item) => item.content), 'passage');
    const seen = new Set<string>();
    return passages
      .map((item, index) => ({
        item,
        score: Math.max(...queries.map((query) => dot(vectors[index], query)))
          + focusLexicalBonus(item.content, queryTexts),
      }))
      .filter(({ score }) => score >= this.minimumScore)
      .sort((first, second) => second.score - first.score)
      .filter(({ item }) => {
        if (seen.has(item.sourceId)) return false;
        seen.add(item.sourceId);
        return true;
      })
      .slice(0, limit)
      .map(({ item }) => ({ id: `${item.sourceId}#focus`, content: item.content }));
  }

  private async ensureIndex(chunks: Evidence[]): Promise<SemanticIndex> {
    const signature = this.store.signature(chunks);
    if (matches(this.memory, this.embedder.modelId, signature)) return this.memory;
    if (this.pending?.signature === signature) return this.pending.task;

    const task = this.loadOrBuild(chunks, signature);
    this.pending = { signature, task };
    try {
      return await task;
    } finally {
      if (this.pending?.task === task) this.pending = undefined;
    }
  }

  private async loadOrBuild(chunks: Evidence[], signature: string): Promise<SemanticIndex> {
    const cached = await this.store.read(this.embedder.modelId, signature);
    if (cached) return (this.memory = cached);

    const vectors = await this.embedder.embed(chunks.map((chunk) => chunk.content), 'passage');
    if (vectors.length !== chunks.length) throw new Error('Embedding count does not match chunks.');
    const index = {
      modelId: this.embedder.modelId,
      signature,
      vectors: chunks.map((chunk, index) => ({ id: chunk.id, vector: vectors[index] })),
    };
    await this.store.write(index);
    return (this.memory = index);
  }
}

interface FocusPassage {
  content: string;
  sourceId: string;
}

function focusPassages(evidence: Evidence[]): FocusPassage[] {
  return evidence.flatMap((item) => {
    const units = item.content
      .split(/\n+|(?<=[.!?؟])\s+/u)
      .map((unit) => unit.trim())
      .filter((unit) => unit.length > 1);
    if (units.length <= 12) return [{ content: units.join('\n'), sourceId: item.id }];
    const passages: FocusPassage[] = [];
    for (let start = 0; start < units.length; start += 6) {
      passages.push({ content: units.slice(start, start + 12).join('\n'), sourceId: item.id });
      if (start + 12 >= units.length) break;
    }
    return passages;
  }).slice(0, 64);
}

function matches(index: SemanticIndex | undefined, modelId: string, signature: string): index is SemanticIndex {
  return index?.modelId === modelId && index.signature === signature;
}

function dot(first: number[], second: number[]): number {
  if (first.length !== second.length) return Number.NEGATIVE_INFINITY;
  return first.reduce((total, value, index) => total + value * second[index], 0);
}

function focusLexicalBonus(content: string, queries: string[]): number {
  const contentTerms = new Set(tokenize(normalizeArabic(content)));
  const matches = Math.max(0, ...queries.map((query) =>
    [...new Set(tokenize(normalizeArabic(query)))]
      .filter((term) => term.length >= 3 && contentTerms.has(term)).length));
  return Math.min(matches * 0.08, 0.4);
}
