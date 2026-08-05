export type TranslationLanguageCode =
  | 'arb_Arab'
  | 'eng_Latn'
  | 'fra_Latn'
  | 'rus_Cyrl'
  | 'spa_Latn'
  | 'swh_Latn';

export interface TextTranslator {
  translate(
    text: string,
    source: TranslationLanguageCode,
    target: TranslationLanguageCode,
  ): Promise<string>;
}
