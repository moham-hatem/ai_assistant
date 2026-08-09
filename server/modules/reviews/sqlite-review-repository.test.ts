import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { AppError } from '../../errors.ts';
import { AnswerService } from '../../answer-service.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { ReviewService } from './review-service.ts';
import { SqliteReviewRepository } from './sqlite-review-repository.ts';
import { normalizeApprovedQuestion } from '../approved-answers/approved-answer-domain.ts';

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

test('approval records an immutable decision and creates the approved answer as-is', async () => {
  await withFixture(async ({ reviews, service, questionLogs }) => {
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
    assert.deepEqual(detail.events.map((event) => event.type), ['created', 'decision_saved']);
    const approved = await reviews.findActiveExact({
      answerLanguage: questionLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(questionLog.question),
    });
    assert.equal(approved?.answer, questionLog.answer);
    assert.deepEqual(approved?.evidenceReferences, questionLog.evidenceReferences);
    assert.equal(approved?.sourceDecisionId, detail.decision?.id);
    assert.equal(approved?.sourceReviewItemId, item.id);
    assert.equal(approved?.reviewerId, 'teacher-1');
    assert.equal(approved?.version, 1);
    await assert.rejects(
      service.saveDecision(item.id, { outcome: 'rejected', reviewerId: 'teacher-1' }),
      (error: unknown) => appError(error, 'INVALID_REVIEW_TRANSITION', 409),
    );
  });
});

test('edited approval stores the corrected wording as the approved answer', async () => {
  await withFixture(async ({ reviews, service, questionLogs }) => {
    const changeLog = record({ channel: 'mobile-app' });
    await questionLogs.save(changeLog);
    const change = await service.createReview(changeLog.id);

    const changed = await service.saveDecision(change.id, {
      correctedAnswer: 'A reviewed and corrected answer.',
      outcome: 'approved',
      reviewerId: 'teacher-2',
    });
    assert.equal(changed.item.status, 'approved');
    assert.equal(changed.decision?.correctedAnswer, 'A reviewed and corrected answer.');
    assert.equal((await reviews.findActiveExact({
      answerLanguage: changeLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(changeLog.question),
    }))?.answer, 'A reviewed and corrected answer.');
  });
});

test('rejection records notes without a corrected or approved answer', async () => {
  await withFixture(async ({ reviews, service, questionLogs }) => {
    const rejectLog = record();
    await questionLogs.save(rejectLog);
    const reject = await service.createReview(rejectLog.id);

    const rejected = await service.saveDecision(reject.id, {
      internalNotes: 'The cited source does not support the conclusion.',
      outcome: 'rejected',
      reviewerId: 'teacher-3',
    });
    assert.equal(rejected.item.status, 'rejected');
    assert.equal(rejected.decision?.internalNotes, 'The cited source does not support the conclusion.');
    assert.equal(rejected.decision?.correctedAnswer, null);
    assert.equal(await reviews.findActiveExact({
      answerLanguage: rejectLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(rejectLog.question),
    }), undefined);
  });
});

test('needs_changes records a content-change reason without an approved answer', async () => {
  await withFixture(async ({ reviews, service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const detail = await service.saveDecision(item.id, {
      internalNotes: 'The source content must be corrected before a new answer is approved.',
      outcome: 'needs_changes',
      reviewerId: 'teacher-content',
    });
    assert.equal(detail.item.status, 'needs_changes');
    assert.equal(detail.decision?.correctedAnswer, null);
    assert.match(detail.decision?.internalNotes ?? '', /source content/u);
    assert.equal(await reviews.findActiveExact({
      answerLanguage: questionLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(questionLog.question),
    }), undefined);
  });
});

test('later approval creates a new version and retires the previous version with an audit link', async () => {
  await withFixture(async ({ path, reviews, service, questionLogs }) => {
    const question = '  What is   purification? ';
    const firstLog = record({ answer: 'First approved wording.', question });
    const secondLog = record({ answer: 'Second generated wording.', question: 'what is purification?' });
    await questionLogs.save(firstLog);
    await questionLogs.save(secondLog);
    const firstReview = await service.createReview(firstLog.id);
    const secondReview = await service.createReview(secondLog.id);
    await service.saveDecision(firstReview.id, { outcome: 'approved', reviewerId: 'teacher-1' });
    await service.saveDecision(secondReview.id, {
      correctedAnswer: 'Second approved wording.',
      outcome: 'approved',
      reviewerId: 'teacher-2',
    });

    const normalizedQuestion = normalizeApprovedQuestion(question);
    const active = await reviews.findActiveExact({ answerLanguage: 'en', normalizedQuestion });
    assert.equal(active?.answer, 'Second approved wording.');
    assert.equal(active?.version, 2);

    const control = new DatabaseSync(path);
    try {
      const rows = control.prepare(`
        SELECT id, version, status, retired_at, superseded_by_answer_id
        FROM approved_answers
        WHERE normalized_question = ? AND answer_language = 'en'
        ORDER BY version
      `).all(normalizedQuestion) as unknown as Array<{
        id: string;
        retired_at: string | null;
        status: string;
        superseded_by_answer_id: string | null;
        version: number;
      }>;
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.status, 'retired');
      assert.ok(rows[0]?.retired_at);
      assert.equal(rows[0]?.superseded_by_answer_id, rows[1]?.id);
      assert.equal(rows[1]?.status, 'active');
    } finally {
      control.close();
    }
  });
});

test('exact normalized lookup remains language-specific', async () => {
  await withFixture(async ({ reviews, service, questionLogs }) => {
    const questionLog = record({ question: 'What is Wudu?' });
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    await service.saveDecision(item.id, { outcome: 'approved', reviewerId: 'teacher' });

    assert.ok(await reviews.findActiveExact({
      answerLanguage: 'en',
      normalizedQuestion: normalizeApprovedQuestion('  WHAT is wudu !!! '),
    }));
    assert.equal(await reviews.findActiveExact({
      answerLanguage: 'ar',
      normalizedQuestion: normalizeApprovedQuestion('What is Wudu?'),
    }), undefined);
    assert.equal(await reviews.findActiveExact({
      answerLanguage: 'en',
      normalizedQuestion: normalizeApprovedQuestion('What is ritual Wudu?'),
    }), undefined);
  });
});

test('mixed evidence JSON fails closed and AnswerService falls back to the normal model path', async () => {
  await withFixture(async ({ path, reviews, service, questionLogs }) => {
    const questionLog = record({ question: 'Can corrupted evidence be served?' });
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    await service.saveDecision(item.id, { outcome: 'approved', reviewerId: 'teacher' });

    const control = new DatabaseSync(path);
    try {
      control.exec('DROP TRIGGER approved_answers_retirement_only;');
      control.prepare(`
        UPDATE approved_answers SET evidence_references = ? WHERE source_review_item_id = ?
      `).run('["book:edition:chunk", 7]', item.id);
    } finally {
      control.close();
    }

    const stored = await reviews.findActiveExact({
      answerLanguage: questionLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(questionLog.question),
    });
    assert.deepEqual(stored?.evidenceReferences, []);

    let modelCalls = 0;
    let validationCalls = 0;
    const answerService = new AnswerService(
      {
        search: async () => ({
          evidence: [{ content: 'Fresh, currently valid evidence.', id: 'fresh:1' }],
          fileCount: 1,
        }),
      },
      4,
      {
        answer: async () => {
          modelCalls += 1;
          return { answer: 'Fresh fallback answer.', grounded: true };
        },
      },
      undefined,
      reviews,
      {
        validate: async () => {
          validationCalls += 1;
          return { evidence: [], valid: true };
        },
      },
    );

    const result = await answerService.answer({
      history: [],
      language: 'en',
      question: questionLog.question,
    });
    assert.equal(result.answer, 'Fresh fallback answer.');
    assert.equal(result.generation?.provider, undefined);
    assert.equal(modelCalls, 1);
    assert.equal(validationCalls, 0);
  });
});

test('invalid decision field combinations are rejected before persistence', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const invalid = [
      { correctedAnswer: 'Not allowed', outcome: 'rejected' as const, reviewerId: 'teacher' },
      { correctedAnswer: 'Not allowed', outcome: 'needs_changes' as const, reviewerId: 'teacher' },
      { outcome: 'needs_changes' as const, reviewerId: 'teacher' },
    ];
    for (const decision of invalid) {
      await assert.rejects(
        service.saveDecision(item.id, decision),
        (error: unknown) => appError(error, 'INVALID_REQUEST', 400),
      );
    }
    assert.equal((await service.getReview(item.id)).events.length, 1);
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

test('detail returns ordered append-only claim, release, and decision events with ownership', async () => {
  await withFixture(async ({ service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    await service.transitionStatus(item.id, 'in_review', 'teacher-a');
    await service.transitionStatus(item.id, 'pending', 'teacher-a');
    await service.transitionStatus(item.id, 'in_review', 'teacher-b');
    const detail = await service.saveDecision(item.id, {
      outcome: 'approved',
      reviewerId: 'teacher-b',
    });

    assert.deepEqual(
      detail.events.map((event) => event.type),
      ['created', 'claimed', 'released', 'claimed', 'decision_saved'],
    );
    assert.deepEqual(
      detail.events.map((event) => event.reviewerId),
      [null, 'teacher-a', 'teacher-a', 'teacher-b', 'teacher-b'],
    );
    assert.deepEqual(
      detail.events.map((event) => [event.fromStatus, event.toStatus]),
      [
        [null, 'pending'],
        ['pending', 'in_review'],
        ['in_review', 'pending'],
        ['pending', 'in_review'],
        ['in_review', 'approved'],
      ],
    );
    assert.equal(detail.events.at(-1)?.decisionId, detail.decision?.id);
  });
});

test('a failed event append rolls back the decision and status update together', async () => {
  await withFixture(async ({ path, reviews, service, questionLogs }) => {
    const questionLog = record();
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const control = new DatabaseSync(path);
    control.exec(`
      CREATE TRIGGER force_review_event_failure
      BEFORE INSERT ON review_events WHEN NEW.event_type = 'decision_saved'
      BEGIN SELECT RAISE(ABORT, 'forced event failure'); END;
    `);
    control.close();

    await assert.rejects(service.saveDecision(item.id, {
      outcome: 'approved',
      reviewerId: 'teacher-rollback',
    }));
    assert.equal(await reviews.findDecision(item.id), undefined);
    assert.equal((await reviews.findItem(item.id))?.status, 'pending');
    assert.deepEqual((await reviews.findEvents(item.id)).map((event) => event.type), ['created']);
  });
});

test('a failed approved-answer insert rolls back the approval decision, status, and retirement', async () => {
  await withFixture(async ({ path, reviews, service, questionLogs }) => {
    const questionLog = record({ question: 'Atomic approval?' });
    await questionLogs.save(questionLog);
    const item = await service.createReview(questionLog.id);
    const control = new DatabaseSync(path);
    control.exec(`
      CREATE TRIGGER force_approved_answer_failure
      BEFORE INSERT ON approved_answers
      BEGIN SELECT RAISE(ABORT, 'forced approved-answer failure'); END;
    `);
    control.close();

    await assert.rejects(service.saveDecision(item.id, {
      outcome: 'approved',
      reviewerId: 'teacher-rollback',
    }), /forced approved-answer failure/u);
    assert.equal(await reviews.findDecision(item.id), undefined);
    assert.equal((await reviews.findItem(item.id))?.status, 'pending');
    assert.deepEqual((await reviews.findEvents(item.id)).map((event) => event.type), ['created']);
    assert.equal(await reviews.findActiveExact({
      answerLanguage: questionLog.answerLanguage,
      normalizedQuestion: normalizeApprovedQuestion(questionLog.question),
    }), undefined);
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
