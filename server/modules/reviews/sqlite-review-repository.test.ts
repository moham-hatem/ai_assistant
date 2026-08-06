import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { AppError } from '../../errors.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { ReviewService } from './review-service.ts';
import { SqliteReviewRepository } from './sqlite-review-repository.ts';

test('creating a review requires an existing question log and prevents duplicates', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const created = await service.createReview(questionLog.id);
    assert.equal(created.questionLogId, questionLog.id);
    assert.equal(created.status, 'pending');

    await assert.rejects(
      service.createReview(questionLog.id),
      (error: unknown) => appError(error, 'DUPLICATE_REVIEW', 409),
    );
    await assert.rejects(
      service.createReview(randomUUID()),
      (error: unknown) => appError(error, 'QUESTION_LOG_NOT_FOUND', 404),
    );
  });
});

test('approval records an immutable decision and permits an unclaimed reviewer', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const detail = await service.saveDecision(item.id, {
      internalNotes: 'Evidence checked.',
      outcome: 'approved',
      reviewerId: 'teacher-1',
    });

    assert.equal(detail.item.status, 'approved');
    assert.equal(detail.item.assignedReviewerId, 'teacher-1');
    assert.equal(detail.decision?.outcome, 'approved');
    assert.equal(detail.decision?.correctedAnswer, null);
    await assert.rejects(
      service.saveDecision(item.id, { outcome: 'rejected', reviewerId: 'teacher-1' }),
      (error: unknown) => appError(error, 'INVALID_REVIEW_TRANSITION', 409),
    );
  });
});

test('needs_changes stores the corrected answer and rejection stores internal notes', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const changeLog = record({ channel: 'mobile-app' });
    const rejectLog = record();
    await questionLogs.save(changeLog);
    await questionLogs.save(rejectLog);
    const change = await service.createReview(changeLog.id);
    const reject = await service.createReview(rejectLog.id);

    const changed = await service.saveDecision(change.id, {
      correctedAnswer: 'A reviewed and corrected answer.',
      outcome: 'needs_changes',
      reviewerId: 'teacher-2',
    });
    assert.equal(changed.item.status, 'needs_changes');
    assert.equal(changed.decision?.correctedAnswer, 'A reviewed and corrected answer.');

    const rejected = await service.saveDecision(reject.id, {
      internalNotes: 'The cited source does not support the conclusion.',
      outcome: 'rejected',
      reviewerId: 'teacher-3',
    });
    assert.equal(rejected.item.status, 'rejected');
    assert.equal(rejected.decision?.internalNotes, 'The cited source does not support the conclusion.');
  });
});

test('claims enforce reviewer ownership and reject invalid state transitions', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const claimed = await service.transitionStatus(item.id, 'in_review', 'teacher-a');
    assert.equal(claimed.assignedReviewerId, 'teacher-a');

    await assert.rejects(
      service.transitionStatus(item.id, 'pending', 'teacher-b'),
      (error: unknown) => appError(error, 'REVIEW_CONFLICT', 409),
    );
    await assert.rejects(
      service.transitionStatus(item.id, 'approved', 'teacher-a'),
      (error: unknown) => appError(error, 'INVALID_REVIEW_TRANSITION', 409),
    );
  });
});

test('a failed status update rolls back the decision insert', async () => {
  await withFixture(async ({ path, reviews, service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const control = new DatabaseSync(path);
    control.exec(`
      CREATE TRIGGER force_review_update_failure
      BEFORE UPDATE ON review_items BEGIN SELECT RAISE(ABORT, 'forced update failure'); END;
    `);
    control.close();

    await assert.rejects(service.saveDecision(item.id, {
      outcome: 'approved',
      reviewerId: 'teacher-rollback',
    }));
    assert.equal(await reviews.findDecision(item.id), undefined);
    assert.equal((await reviews.findItem(item.id))?.status, 'pending');
  });
});

test('review list paginates and filters by status, reviewer, channel, and language', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const inputs = [
      record({ answerLanguage: 'en', channel: 'web' }),
      record({ answerLanguage: 'ar', channel: 'telegram' }),
      record({ answerLanguage: 'en-GB', channel: 'future-channel' }),
    ];
    for (const input of inputs) {
      await questionLogs.save(input);
      await service.createReview(input.id);
    }
    const secondPage = await service.listReviews({ limit: 1, offset: 1, status: 'pending' });
    assert.equal(secondPage.total, 3);
    assert.equal(secondPage.items.length, 1);
    const future = await service.listReviews({ channel: 'future-channel', limit: 25, offset: 0 });
    assert.equal(future.total, 1);
    assert.equal(future.items[0]?.questionLog.answerLanguage, 'en-GB');

    const claimed = future.items[0];
    assert.ok(claimed);
    await service.transitionStatus(claimed.item.id, 'in_review', 'teacher-filter');
    const assigned = await service.listReviews({
      answerLanguage: 'en-GB',
      limit: 25,
      offset: 0,
      reviewerId: 'teacher-filter',
      status: 'in_review',
    });
    assert.equal(assigned.total, 1);
  });
});

interface Fixture {
  path: string;
  questionLogs: SqliteQuestionLogRepository;
  reviews: SqliteReviewRepository;
  service: ReviewService;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'review-repository-test-'));
  const path = join(directory, 'question-log.sqlite');
  const questionLogs = new SqliteQuestionLogRepository(path);
  const reviews = new SqliteReviewRepository(path);
  let id = 0;
  let tick = 0;
  const service = new ReviewService(
    reviews,
    questionLogs,
    () => new Date(Date.UTC(2026, 7, 6, 10, 0, tick++)),
    () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
  );
  try {
    await run({ path, questionLogs, reviews, service });
  } finally {
    reviews.close();
    questionLogs.close();
    await rm(directory, { recursive: true, force: true });
  }
}

function record(overrides: Partial<QuestionLogRecord> = {}): QuestionLogRecord {
  const id = randomUUID();
  return {
    answer: 'Grounded answer.',
    answerLanguage: 'en',
    apology: null,
    channel: 'web',
    completedAt: '2026-08-06T09:00:00.010Z',
    evidenceReferences: ['book:edition:chunk'],
    grounded: true,
    id,
    latencyMs: 10,
    model: 'test-model',
    provider: 'test-provider',
    question: `Question ${id}?`,
    startedAt: '2026-08-06T09:00:00.000Z',
    status: 'answered',
    sufficiency: 'sufficient',
    ...overrides,
  };
}

function appError(error: unknown, code: string, status: number): boolean {
  return error instanceof AppError && error.code === code && error.status === status;
}
