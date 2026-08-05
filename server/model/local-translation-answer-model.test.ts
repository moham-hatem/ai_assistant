import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalTranslationAnswerModel, detectTranslationLanguage } from './local-translation-answer-model.ts';
import type { TextTranslator, TranslationLanguageCode } from './text-translator.ts';

test('local translation fallback translates grounded Swahili evidence to Arabic', async () => {
  let languages: [TranslationLanguageCode, TranslationLanguageCode] | undefined;
  const translator: TextTranslator = {
    async translate(_text, source, target) {
      languages = [source, target];
      return 'طلب العلم ييسّر طريقًا إلى الجنة.';
    },
  };
  const model = new LocalTranslationAnswerModel(translator);

  const result = await model.answer({
    question: 'لماذا يجب تعلم الدين؟',
    history: [],
    language: 'ar',
  }, [{
    id: 'book:42#focus',
    content: 'kwa ajili ya kutafuta Elimu, Mwenyezi Mungu anamrahisishia njia kwa Pepo.',
  }]);

  assert.deepEqual(languages, ['swh_Latn', 'arb_Arab']);
  assert.match(result.answer, /طلب العلم/);
  assert.equal(result.grounded, true);
});

test('local translation language detection is ready for Russian evidence', () => {
  assert.equal(detectTranslationLanguage('Продолжайте изучать свою религию.'), 'rus_Cyrl');
});

test('local translation fallback translates long evidence one sentence at a time', async () => {
  const translatedInputs: string[] = [];
  const translator: TextTranslator = {
    async translate(text) {
      translatedInputs.push(text);
      return `translated ${translatedInputs.length}`;
    },
  };
  const model = new LocalTranslationAnswerModel(translator);

  const result = await model.answer({
    question: 'لماذا أتعلم ديني؟',
    history: [],
    language: 'ar',
  }, [{
    id: 'book:42#focus',
    content: 'Endelea kujifunza kuhusu dini yako kila siku. Kutafuta elimu hurahisisha njia ya Pepo.',
  }]);

  assert.deepEqual(translatedInputs, [
    'Endelea kujifunza kuhusu dini yako kila siku.',
    'Kutafuta elimu hurahisisha njia ya Pepo.',
  ]);
  assert.match(result.answer, /translated 1 translated 2/u);
});

test('local translation fallback treats a quoted PDF line as a new sentence', async () => {
  const translatedInputs: string[] = [];
  const translator: TextTranslator = {
    async translate(text) {
      translatedInputs.push(text);
      return text;
    },
  };
  const model = new LocalTranslationAnswerModel(translator);

  await model.answer({ question: 'لماذا؟', history: [], language: 'ar' }, [{
    id: 'book:42#focus',
    content: 'Na kumbuka hadithi ya Mtume\n" \'Atakaye ingia kwenye njia kwa ajili ya kutafuta Elimu.',
  }]);

  assert.deepEqual(translatedInputs, [
    'Na kumbuka hadithi ya Mtume.',
    'Atakaye ingia kwenye njia kwa ajili ya kutafuta Elimu.',
  ]);
});
