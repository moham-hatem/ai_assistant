export type EmbeddingKind = 'passage' | 'query';

export interface TextEmbedder {
  readonly modelId: string;
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}
