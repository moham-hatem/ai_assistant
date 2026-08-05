import type { TextTranslator, TranslationLanguageCode } from './text-translator.ts';

interface TranslationOutput {
  translation_text: string;
}

type TranslationPipeline = (
  text: string,
  options: {
    max_new_tokens: number;
    no_repeat_ngram_size: number;
    num_beams: number;
    repetition_penalty: number;
    src_lang: TranslationLanguageCode;
    tgt_lang: TranslationLanguageCode;
  },
) => Promise<TranslationOutput[]>;

export class NllbTranslator implements TextTranslator {
  private pipeline?: Promise<TranslationPipeline>;
  private readonly cacheDirectory: string;
  private readonly model: string;

  constructor(model: string, cacheDirectory: string) {
    this.model = model;
    this.cacheDirectory = cacheDirectory;
  }

  async translate(
    text: string,
    source: TranslationLanguageCode,
    target: TranslationLanguageCode,
  ): Promise<string> {
    if (source === target) return text;
    const translator = await (this.pipeline ??= this.createPipeline());
    const wordCount = text.trim().split(/\s+/u).length;
    const result = await translator(text, {
      max_new_tokens: Math.min(180, Math.max(48, Math.ceil(wordCount * 2.2 + 16))),
      no_repeat_ngram_size: 3,
      num_beams: 4,
      repetition_penalty: 1.15,
      src_lang: source,
      tgt_lang: target,
    });
    const translated = result[0]?.translation_text?.trim();
    if (!translated) throw new Error('The local translation model returned an empty response.');
    return translated;
  }

  private async createPipeline(): Promise<TranslationPipeline> {
    const { env, pipeline } = await import('@huggingface/transformers');
    env.cacheDir = this.cacheDirectory;
    return pipeline('translation', this.model, { dtype: 'q8' }) as Promise<TranslationPipeline>;
  }
}
