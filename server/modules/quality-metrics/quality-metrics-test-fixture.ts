import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteFeedbackRepository } from '../feedback/sqlite-feedback-repository.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { SqliteReviewRepository } from '../reviews/sqlite-review-repository.ts';

export interface QualityMetricsFixture {
  cleanup: () => Promise<void>;
  path: string;
}

export async function createQualityMetricsFixture(): Promise<QualityMetricsFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'quality-metrics-test-'));
  const path = join(directory, 'question-log.sqlite');
  initializeSchema(path);
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON;');
  insertQuestion(database, 'q1', 'en', 'web', 'answered', '2026-08-01T00:00:00.000Z', 'approved-answer');
  insertQuestion(database, 'q2', 'en', 'web', 'declined', '2026-08-03T00:00:00.000Z');
  insertQuestion(database, 'q3', 'ar', 'telegram', 'failed', '2026-08-07T23:59:59.999Z');
  insertQuestion(database, 'q4', 'sw', 'web', 'answered', '2026-07-20T00:00:00.000Z');
  insertQuestion(database, 'q5', 'en', 'web', 'answered', '2026-08-08T00:00:00.000Z');

  insertReview(database, 'r1', 'q1', 'in_review', '2026-08-01T02:00:00.000Z', null);
  insertReview(database, 'r2', 'q2', 'approved', '2026-08-04T00:00:00.000Z', '2026-08-04T00:00:01.000Z');
  insertReview(database, 'r3', 'q3', 'pending', '2026-08-07T22:00:00.000Z', null);
  insertReview(database, 'r4', 'q4', 'rejected', '2026-08-05T00:00:00.000Z', '2026-08-05T00:00:03.000Z');

  insertFeedback(database, 'f1', 'q1', 'helpful', 'en', 'web', '2026-08-01T00:00:00.000Z');
  insertFeedback(database, 'f2', 'q1', 'helpful', 'en', 'web', '2026-08-02T00:00:00.000Z');
  insertFeedback(database, 'f3', 'q2', 'unhelpful', 'en', 'web', '2026-08-04T00:00:00.000Z', 'r2');
  insertFeedback(database, 'f4', 'q3', 'unhelpful', 'ar', 'telegram', '2026-08-07T23:59:59.999Z', 'r3');
  insertFeedback(database, 'f5', 'q5', 'helpful', 'en', 'web', '2026-08-08T00:00:00.000Z');
  database.close();
  return { cleanup: () => rm(directory, { recursive: true, force: true }), path };
}

function initializeSchema(path: string): void {
  const questions = new SqliteQuestionLogRepository(path);
  const reviews = new SqliteReviewRepository(path);
  const feedback = new SqliteFeedbackRepository(path);
  feedback.close();
  reviews.close();
  questions.close();
}

function insertQuestion(
  database: DatabaseSync,
  id: string,
  language: string,
  channel: string,
  status: 'answered' | 'declined' | 'failed',
  startedAt: string,
  provider = 'test-provider',
): void {
  const answered = status === 'answered';
  database.prepare(`INSERT INTO question_logs (
    id, question, answer_language, channel, status, answer, apology,
    evidence_references, started_at, completed_at, latency_ms,
    provider, model, grounded, sufficiency
  ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, 10, ?, 'fixture', ?, ?)`)
    .run(
      id, `private-question-${id}`, language, channel, status,
      answered ? `private-answer-${id}` : null, answered ? null : `private-apology-${id}`,
      startedAt, startedAt, provider, answered ? 1 : null,
      answered ? 'sufficient' : 'insufficient',
    );
}

function insertReview(
  database: DatabaseSync,
  id: string,
  questionId: string,
  status: string,
  createdAt: string,
  decidedAt: string | null,
): void {
  database.prepare(`INSERT INTO review_items (
    id, question_log_id, status, assigned_reviewer_id,
    created_at, updated_at, claimed_at, decided_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, questionId, status, status === 'in_review' ? 'private-reviewer' : null,
      createdAt, decidedAt ?? createdAt, status === 'in_review' ? createdAt : null, decidedAt,
    );
}

function insertFeedback(
  database: DatabaseSync,
  id: string,
  questionId: string,
  rating: 'helpful' | 'unhelpful',
  language: string,
  channel: string,
  createdAt: string,
  reviewId: string | null = null,
): void {
  const digest = (value: string) => value.padEnd(64, '0');
  database.prepare(`INSERT INTO feedback_entries (
    id, question_log_id, submission_digest, payload_digest, question_digest,
    rating, reasons, comment, answer_language, channel,
    review_item_id, review_created, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run(
      id, questionId, digest(`submission-${id}`), digest(`payload-${id}`),
      digest(`question-${questionId}`), rating,
      rating === 'helpful' ? '[]' : '["other"]', `private-comment-${id}`,
      language, channel, reviewId, createdAt,
    );
}

export function fixtureFilters(overrides: Partial<{
  channel: string | null;
  from: string | null;
  language: string | null;
  to: string | null;
}> = {}) {
  return {
    channel: null,
    from: '2026-08-01T00:00:00.000Z',
    language: null,
    to: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}
