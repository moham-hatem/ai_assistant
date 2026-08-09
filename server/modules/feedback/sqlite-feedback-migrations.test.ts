import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { SqliteReviewRepository } from '../reviews/sqlite-review-repository.ts';
import { migrateFeedbackDatabase } from './sqlite-feedback-migrations.ts';
import { SqliteFeedbackRepository } from './sqlite-feedback-repository.ts';

test('feedback migration creates constrained foreign keys without a raw submission id', async () => {
  const fixture = await databaseFixture();
  const feedback = new SqliteFeedbackRepository(fixture.path);
  feedback.close();
  const database = new DatabaseSync(fixture.path);
  try {
    const columns = database.prepare('PRAGMA table_info(feedback_entries)').all() as unknown as
      Array<{ name: string }>;
    assert.equal(columns.some((column) => column.name === 'submission_id'), false);
    assert.equal(columns.some((column) => column.name === 'submission_digest'), true);
    const foreignKeys = database.prepare('PRAGMA foreign_key_list(feedback_entries)').all() as
      unknown as Array<{ table: string }>;
    assert.deepEqual(new Set(foreignKeys.map((key) => key.table)), new Set([
      'question_logs', 'review_items',
    ]));
    const migration = database.prepare(`
      SELECT version FROM feedback_schema_migrations WHERE feature = 'feedback'
    `).get() as unknown as { version: number };
    assert.equal(migration.version, 1);
  } finally {
    database.close();
    await fixture.cleanup();
  }
});

test('feedback migration rolls back all feature objects when a statement fails', async () => {
  const fixture = await databaseFixture();
  const database = new DatabaseSync(fixture.path);
  try {
    database.exec(`
      CREATE TABLE index_owner (id TEXT PRIMARY KEY);
      CREATE INDEX feedback_created_at_idx ON index_owner (id);
    `);
    assert.throws(() => migrateFeedbackDatabase(database), /feedback_created_at_idx/u);
    const table = database.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feedback_entries'
    `).get();
    assert.equal(table, undefined);
    const migration = database.prepare(`
      SELECT version FROM feedback_schema_migrations WHERE feature = 'feedback'
    `).get();
    assert.equal(migration, undefined);
  } finally {
    database.close();
    await fixture.cleanup();
  }
});

async function databaseFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'feedback-migration-test-'));
  const path = join(directory, 'question-log.sqlite');
  const questionLogs = new SqliteQuestionLogRepository(path);
  const reviews = new SqliteReviewRepository(path);
  reviews.close();
  questionLogs.close();
  return {
    cleanup: () => rm(directory, { recursive: true, force: true }),
    path,
  };
}
