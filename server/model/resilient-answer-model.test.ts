import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnswerInput, AnswerModel, Evidence } from '../domain.ts';
import { AppError } from '../errors.ts';
import { ExtractiveAnswerModel } from './extractive-answer-model.ts';
import { ResilientAnswerModel } from './resilient-answer-model.ts';

const input: AnswerInput = {
  history: [],
  language: 'ar',
  question: 'ما هي صلاة الجمعة وما وقتها وما كيفيتها؟',
};
const evidence: Evidence[] = [{
  id: 'lesson:1',
  content: [
    'صلاة الجمعة',
    '',
    'ما هي؟ هي صلاة خاصة تقام مرة واحدة في الأسبوع يوم الجمعة.',
    '',
    'وقتها: تقام في وقت صلاة الظهر.',
    '',
    'كيفيتها: هي ركعتان جهريتان، يسبقهما خطبتان من الإمام.',
    '',
    'فقرة غير مرتبطة عن موضوع آخر.',
  ].join('\n'),
}, {
  id: 'wudu:1',
  content: 'Numbered sequence:\n1. Wudu first\n2. Wudu second',
}];

test('uses a grounded local extract when every external model is unavailable', async () => {
  const unavailable: AnswerModel = {
    answer: async () => {
      throw new AppError('MODEL_UNAVAILABLE', 'busy', 503);
    },
  };
  const model = new ResilientAnswerModel(unavailable, new ExtractiveAnswerModel());

  const result = await model.answer(input, evidence);

  assert.equal(result.grounded, true);
  assert.match(result.answer, /صلاة الجمعة/);
  assert.match(result.answer, /وقت صلاة الظهر/);
  assert.match(result.answer, /ركعتان جهريتان/);
  assert.doesNotMatch(result.answer, /فقرة غير مرتبطة/);
  assert.doesNotMatch(result.answer, /Wudu first/);
});

test('does not hide configuration errors behind the local fallback', async () => {
  const invalidKey: AnswerModel = {
    answer: async () => {
      throw new AppError('MODEL_NOT_CONFIGURED', 'invalid key', 503);
    },
  };
  const model = new ResilientAnswerModel(invalidKey, new ExtractiveAnswerModel());

  await assert.rejects(
    model.answer(input, evidence),
    (error: unknown) => error instanceof AppError && error.code === 'MODEL_NOT_CONFIGURED',
  );
});
