import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AppError } from '../../errors.ts';
import { feedbackQuestion, withFeedbackFixture } from './feedback-test-fixtures.ts';

test('same submission is idempotent and a changed payload conflicts without storing the raw id', async () => {
  await withFeedbackFixture(async ({ path, questionLogs, service }) => {
    const question = feedbackQuestion();
    await questionLogs.save(question);
    const submissionId = randomUUID();
    const input = {
      questionLogId: question.id,
      rating: 'unhelpful' as const,
      reasons: ['harmful_or_sensitive' as const],
      submissionId,
    };
    const first = await service.submit(input);
    const replay = await service.submit(input);
    assert.deepEqual(replay, first);
    assert.equal(first.review.created, true);

    await assert.rejects(
      service.submit({ ...input, comment: 'Different normalized payload.' }),
      (error: unknown) => error instanceof AppError && error.code === 'FEEDBACK_CONFLICT',
    );

    const database = new DatabaseSync(path);
    try {
      const counts = database.prepare(`
        SELECT
          (SELECT COUNT(*) FROM feedback_entries) AS feedback,
          (SELECT COUNT(*) FROM review_items) AS reviews,
          (SELECT COUNT(*) FROM review_events) AS events
      `).get() as unknown as { events: number; feedback: number; reviews: number };
      assert.deepEqual({ ...counts }, { events: 1, feedback: 1, reviews: 1 });
      const stored = database.prepare(`
        SELECT submission_digest, payload_digest FROM feedback_entries
      `).get() as unknown as { payload_digest: string; submission_digest: string };
      assert.equal(stored.submission_digest.length, 64);
      assert.equal(stored.payload_digest.length, 64);
      assert.notEqual(stored.submission_digest, submissionId);
    } finally {
      database.close();
    }
  });
});

test('review event failure rolls back feedback, review, event, and link together', async () => {
  await withFeedbackFixture(async ({ path, questionLogs, service }) => {
    const question = feedbackQuestion();
    await questionLogs.save(question);
    const database = new DatabaseSync(path);
    database.exec(`
      CREATE TRIGGER fail_feedback_review_event
      BEFORE INSERT ON review_events BEGIN
        SELECT RAISE(ABORT, 'forced review event failure');
      END;
    `);
    database.close();

    await assert.rejects(service.submit({
      questionLogId: question.id,
      rating: 'unhelpful',
      reasons: ['harmful_or_sensitive'],
      submissionId: randomUUID(),
    }), /forced review event failure/u);

    const inspected = new DatabaseSync(path);
    try {
      const counts = inspected.prepare(`
        SELECT
          (SELECT COUNT(*) FROM feedback_entries) AS feedback,
          (SELECT COUNT(*) FROM review_items) AS reviews,
          (SELECT COUNT(*) FROM review_events) AS events
      `).get() as unknown as { events: number; feedback: number; reviews: number };
      assert.deepEqual({ ...counts }, { events: 0, feedback: 0, reviews: 0 });
    } finally {
      inspected.close();
    }
  });
});
