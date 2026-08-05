import type { EmbeddingKind, TextEmbedder } from './embedding.ts';

interface TensorOutput {
  tolist(): unknown;
}

type Extractor = (
  inputs: string[],
  options: { normalize: true; pooling: 'mean' },
) => Promise<TensorOutput>;

export class MultilingualEmbedder implements TextEmbedder {
  readonly modelId: string;
  private readonly cacheDirectory: string;
  private extractor?: Promise<Extractor>;

  constructor(modelId: string, cacheDirectory: string) {
    this.modelId = modelId;
    this.cacheDirectory = cacheDirectory;
  }

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    const extractor = await (this.extractor ??= this.createExtractor());
    const vectors: number[][] = [];

    for (let start = 0; start < texts.length; start += 8) {
      const batch = texts.slice(start, start + 8).map((text) => `${kind}: ${text}`);
      const output = await extractor(batch, { pooling: 'mean', normalize: true });
      vectors.push(...asVectors(output.tolist()));
    }
    return vectors;
  }

  private async createExtractor(): Promise<Extractor> {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = this.cacheDirectory;
    return pipeline('feature-extraction', this.modelId, { dtype: 'q8' }) as Promise<Extractor>;
  }
}

function asVectors(value: unknown): number[][] {
  if (!Array.isArray(value) || !value.every(
    (row) => Array.isArray(row) && row.every((item) => typeof item === 'number' && Number.isFinite(item)),
  )) {
    throw new Error('Embedding model returned an invalid tensor.');
  }
  return value as number[][];
}
