import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteReviewRepository } from './sqlite-review-repository.ts';

test('migrations backfill eligible approvals and skip punctuation-only normalized questions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'review-migration-test-'));
  const path = join(directory, 'question-log.sqlite');
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE question_logs (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer_language TEXT NOT NULL,
      status TEXT NOT NULL,
      answer TEXT,
      evidence_references TEXT NOT NULL
    );
    INSERT INTO question_logs VALUES (
      'question-1', 'What is purification?', 'en', 'answered',
      'Original generated answer.', '["books/book-1/editions/edition-1:1"]'
    );
    INSERT INTO question_logs VALUES (
      'question-2', ' ؟! ... ', 'ar', 'answered',
      'Historical answer that must not be published.', '["books/book-1/editions/edition-1:2"]'
    );

    CREATE TABLE review_items (
      id TEXT PRIMARY KEY,
      question_log_id TEXT NOT NULL UNIQUE REFERENCES question_logs(id),
      status TEXT NOT NULL,
      assigned_reviewer_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claimed_at TEXT,
      decided_at TEXT
    );
    CREATE TABLE review_decisions (
      id TEXT PRIMARY KEY,
      review_item_id TEXT NOT NULL UNIQUE REFERENCES review_items(id),
      outcome TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      internal_notes TEXT,
      corrected_answer TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE review_schema_migrations (
      feature TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (feature, version)
    ) STRICT;
    INSERT INTO review_schema_migrations VALUES ('teacher_reviews', 1, '2026-08-06T09:00:00Z');
    INSERT INTO review_items VALUES (
      'review-1', 'question-1', 'needs_changes', 'teacher-legacy',
      '2026-08-06T10:00:00Z', '2026-08-06T10:05:00Z', NULL, '2026-08-06T10:05:00Z'
    );
    INSERT INTO review_items VALUES (
      'review-2', 'question-2', 'needs_changes', 'teacher-legacy',
      '2026-08-06T10:01:00Z', '2026-08-06T10:06:00Z', NULL, '2026-08-06T10:06:00Z'
    );
    INSERT INTO review_decisions VALUES (
      'decision-1', 'review-1', 'needs_changes', 'teacher-legacy', NULL,
      'Legacy corrected answer.', '2026-08-06T10:05:00Z'
    );
    INSERT INTO review_decisions VALUES (
      'decision-2', 'review-2', 'needs_changes', 'teacher-legacy', NULL,
      'Punctuation-only question correction.', '2026-08-06T10:06:00Z'
    );
  `);
  database.close();

  const repository = new SqliteReviewRepository(path);
  try {
    assert.equal((await repository.findItem('review-1'))?.status, 'approved');
    const decision = await repository.findDecision('review-1');
    assert.equal(decision?.outcome, 'approved');
    assert.equal(decision?.correctedAnswer, 'Legacy corrected answer.');
    assert.deepEqual(
      (await repository.findEvents('review-1')).map((event) => event.type),
      ['created', 'decision_saved'],
    );
  } finally {
    repository.close();
  }

  const migrated = new DatabaseSync(path);
  try {
    const version = migrated.prepare(`
      SELECT MAX(version) AS version FROM review_schema_migrations WHERE feature = 'teacher_reviews'
    `).get() as unknown as { version: number };
    assert.equal(version.version, 2);
    const approvedAnswerVersion = migrated.prepare(`
      SELECT MAX(version) AS version
      FROM approved_answer_schema_migrations WHERE feature = 'approved_answers'
    `).get() as unknown as { version: number };
    assert.equal(approvedAnswerVersion.version, 1);
    const approvedAnswerTable = migrated.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'approved_answers'
    `).get() as unknown as { name: string } | undefined;
    assert.equal(approvedAnswerTable?.name, 'approved_answers');
    const migratedAnswer = migrated.prepare(`
      SELECT answer_text, version, status, source_review_item_id, source_decision_id
      FROM approved_answers WHERE normalized_question = 'what is purification'
    `).get() as unknown as {
      answer_text: string;
      source_decision_id: string;
      source_review_item_id: string;
      status: string;
      version: number;
    };
    assert.deepEqual({ ...migratedAnswer }, {
      answer_text: 'Legacy corrected answer.',
      source_decision_id: 'decision-1',
      source_review_item_id: 'review-1',
      status: 'active',
      version: 1,
    });
    const ineligibleCount = migrated.prepare(`
      SELECT COUNT(*) AS total FROM approved_answers WHERE source_decision_id = 'decision-2'
    `).get() as unknown as { total: number };
    assert.equal(ineligibleCount.total, 0);
    assert.throws(() => migrated.exec(`
      UPDATE review_events SET to_status = 'rejected' WHERE review_item_id = 'review-1';
    `), /append-only/u);
    assert.throws(() => migrated.exec(`
      DELETE FROM review_events WHERE review_item_id = 'review-1';
    `), /append-only/u);
  } finally {
    migrated.close();
    await rm(directory, { recursive: true, force: true });
  }
});
