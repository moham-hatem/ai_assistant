import assert from 'node:assert/strict';
import test from 'node:test';
import { AnswerService } from '../../server/answer-service.ts';
import { assertSelectedLanguage } from '../../server/model/answer-quality.ts';
import { FixtureAnswerModel, FixtureKnowledgeSource } from './doubles.ts';
import { acceptanceFixtures } from './fixtures.ts';

const MATCH_COUNT = 4;

for (const fixture of acceptanceFixtures) {
  test(`${fixture.id}: ${fixture.title}`, async () => {
    const knowledge = new FixtureKnowledgeSource(fixture.searchResults);
    const model = new FixtureAnswerModel(fixture.modelResult);
    const service = new AnswerService(knowledge, MATCH_COUNT, model);

    const execution = await service.answerWithContext(fixture.input);

    assert.deepEqual(execution.result, fixture.expectedResult);
    assertSelectedLanguage(execution.result.answer, fixture.input.language);
    assert.deepEqual(execution.evidenceReferences, fixture.expectedEvidence.map((item) => item.id));
    assert.deepEqual(knowledge.calls.map((call) => call.question), fixture.expectedSearches);
    assert.ok(knowledge.calls.every((call) => call.limit === MATCH_COUNT));
    assert.ok(knowledge.calls.every((call) => call.alternatives.length === 0));

    const expectedModelCalls = fixture.expectedResult.grounded ? 1 : 0;
    assert.equal(model.calls.length, expectedModelCalls);
    if (model.calls[0]) {
      assert.deepEqual(model.calls[0].input, fixture.input);
      assert.deepEqual(model.calls[0].evidence, fixture.expectedEvidence);
    }

    if (fixture.id === 'history-is-not-evidence') {
      assert.ok(fixture.input.history.length > 0);
      assert.equal(model.calls.length, 0);
      assert.equal(execution.result.grounded, false);
      assert.equal(execution.evidenceReferences.length, 0);
    }

    if (fixture.id === 'ordered-procedure') {
      const answer = execution.result.answer;
      assert.ok(answer.indexOf('1.') < answer.indexOf('2.'));
      assert.ok(answer.indexOf('2.') < answer.indexOf('3.'));
      assert.doesNotMatch(model.calls[0]?.evidence[0]?.content ?? '', /ملاحظة مصطنعة/u);
    }

    if (fixture.id === 'swahili-why-answer') {
      assert.doesNotMatch(model.calls[0]?.evidence[0]?.content ?? '', /Mlango wa darasa/u);
    }
  });
}

test('approved answer priority: a valid exact-language approval bypasses model generation', async () => {
  const knowledge = new FixtureKnowledgeSource({
    'What is wudu?': [{ content: 'Fresh searchable evidence.', id: 'live:1' }],
  });
  const model = new FixtureAnswerModel({ answer: 'Model answer.', grounded: true });
  const service = new AnswerService(
    knowledge,
    MATCH_COUNT,
    model,
    undefined,
    {
      findActiveExact: async ({ answerLanguage, normalizedQuestion }) => {
        assert.equal(answerLanguage, 'en');
        assert.equal(normalizedQuestion, 'what is wudu');
        return {
          answer: 'Teacher-approved answer.',
          answerLanguage: 'en',
          approvedAt: '2026-08-09T10:00:00.000Z',
          createdAt: '2026-08-09T10:00:00.000Z',
          evidenceReferences: ['books/book/editions/edition:1'],
          id: 'approved-1',
          normalizedQuestion,
          question: 'What is wudu?',
          retiredAt: null,
          reviewerId: 'teacher',
          sourceDecisionId: 'decision-1',
          sourceReviewItemId: 'review-1',
          status: 'active',
          supersededByAnswerId: null,
          version: 1,
        };
      },
    },
    {
      validate: async () => ({
        evidence: [{ content: 'Still published.', id: 'books/book/editions/edition:1' }],
        valid: true,
      }),
    },
  );

  const execution = await service.answerWithContext({
    history: [],
    language: 'en',
    question: 'What is wudu?',
  });
  assert.equal(execution.result.answer, 'Teacher-approved answer.');
  assert.equal(execution.result.generation?.provider, 'approved-answer');
  assert.deepEqual(execution.evidenceReferences, ['books/book/editions/edition:1']);
  assert.equal(knowledge.calls.length, 0);
  assert.equal(model.calls.length, 0);
});
