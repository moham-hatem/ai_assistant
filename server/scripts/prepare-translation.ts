import { createLocalConfig } from '../config.ts';
import { NllbTranslator } from '../model/nllb-translator.ts';

const config = createLocalConfig(process.env as Record<string, string>, process.cwd());
const translator = new NllbTranslator(
  config.translation.model,
  config.translation.cacheDirectory,
);
const result = await translator.translate(
  'Kutafuta elimu ni njia nyepesi kwa Pepo.',
  'swh_Latn',
  'arb_Arab',
);
console.log(`Local translation model is ready: ${result}`);
