import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { ReviewService } from '../reviews/review-service.ts';
import { feedbackQuestion, withFeedbackFixture } from './feedback-test-fixtures.ts';

test('harmful feedback creates an immediate review while helpful feedback never does', async () => {
  await withFeedbackFixture(async ({ questionLogs, service }) => {
    const helpfulQuestion = feedbackQuestion();
    const harmfulQuestion = feedbackQuestion();
    await questionLogs.save(helpfulQuestion);
    await questionLogs.save(harmfulQuestion);
    const helpful = await service.submit({
      questionLogId: helpfulQuestion.id,
      rating: 'helpful',
      reasons: [],
      submissionId: randomUUID(),
    });
    const harmful = await service.submit({
      questionLogId: harmfulQuestion.id,
      rating: 'unhelpful',
      reasons: ['harmful_or_sensitive'],
      submissionId: randomUUID(),
    });
    assert.deepEqual(helpful.review, { created: false, reviewId: null });
    assert.equal(harmful.review.created, true);
    assert.ok(harmful.review.reviewId);
  });
});

test('third unhelpful rating for the normalized question and language reviews the current case', async () => {
  await withFeedbackFixture(async ({ path, questionLogs, service }) => {
    const inputs = [
      feedbackQuestion({ question: 'What is Wudu?' }),
      feedbackQuestion({ question: '  WHAT IS WUDU!!!  ' }),
      feedbackQuestion({ answerLanguage: 'sw', question: 'What is wudu?' }),
      feedbackQuestion({ question: 'What is wudu' }),
    ];
    for (const question of inputs) await questionLogs.save(question);

    for (const question of inputs.slice(0, 3)) {
      const result = await service.submit({
        questionLogId: question.id,
        rating: 'unhelpful',
        reasons: ['unclear'],
        submissionId: randomUUID(),
      });
      assert.equal(result.review.reviewId, null);
    }
    const threshold = await service.submit({
      questionLogId: inputs[3]!.id,
      rating: 'unhelpful',
      reasons: ['inaccurate'],
      submissionId: randomUUID(),
    });
    assert.equal(threshold.review.created, true);

    const database = new DatabaseSync(path);
    try {
      const reviews = database.prepare('SELECT COUNT(*) AS total FROM review_items').get() as
        unknown as { total: number };
      assert.equal(reviews.total, 1);
    } finally {
      database.close();
    }
  });
});

test('feedback links an existing review instead of creating a duplicate', async () => {
  await withFeedbackFixture(async ({ path, questionLogs, reviews, service }) => {
    const question = feedbackQuestion();
    await questionLogs.save(question);
    const existing = await new ReviewService(reviews, questionLogs).createReview(question.id);
    const result = await service.submit({
      questionLogId: question.id,
      rating: 'unhelpful',
      reasons: ['harmful_or_sensitive'],
      submissionId: randomUUID(),
    });
    assert.deepEqual(result.review, { created: false, reviewId: existing.id });

    const database = new DatabaseSync(path);
    try {
      const reviewsCount = database.prepare('SELECT COUNT(*) AS total FROM review_items').get() as
        unknown as { total: number };
      assert.equal(reviewsCount.total, 1);
    } finally {
      database.close();
    }
  });
});
