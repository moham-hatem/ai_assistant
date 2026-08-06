import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteReviewRepository } from './sqlite-review-repository.ts';

test('migration 2 preserves legacy corrections as edited approvals and seeds immutable history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'review-migration-test-'));
  const path = join(directory, 'question-log.sqlite');
  const database = new DatabaseSync(path);
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE question_logs (id TEXT PRIMARY KEY);
    INSERT INTO question_logs (id) VALUES ('question-1');

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
    INSERT INTO review_decisions VALUES (
      'decision-1', 'review-1', 'needs_changes', 'teacher-legacy', NULL,
      'Legacy corrected answer.', '2026-08-06T10:05:00Z'
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
