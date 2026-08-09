import type { DatabaseSync } from 'node:sqlite';
import { normalizeApprovedQuestion } from './approved-answer-domain.ts';

const feature = 'approved_answers';
const migrations = [
  `
    CREATE TABLE approved_answers (
      id TEXT PRIMARY KEY,
      normalized_question TEXT NOT NULL CHECK (length(normalized_question) > 0),
      question_text TEXT NOT NULL CHECK (length(trim(question_text)) > 0),
      answer_language TEXT NOT NULL CHECK (length(trim(answer_language)) > 0),
      answer_text TEXT NOT NULL CHECK (length(trim(answer_text)) > 0),
      evidence_references TEXT NOT NULL CHECK (
        json_valid(evidence_references)
        AND json_type(evidence_references) = 'array'
        AND json_array_length(evidence_references) > 0
      ),
      source_review_item_id TEXT NOT NULL
        REFERENCES review_items(id) ON DELETE RESTRICT,
      source_decision_id TEXT NOT NULL UNIQUE
        REFERENCES review_decisions(id) ON DELETE RESTRICT,
      version INTEGER NOT NULL CHECK (version > 0),
      status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      reviewer_id TEXT NOT NULL CHECK (length(trim(reviewer_id)) > 0),
      approved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retired_at TEXT,
      superseded_by_answer_id TEXT REFERENCES approved_answers(id)
        DEFERRABLE INITIALLY DEFERRED,
      UNIQUE (normalized_question, answer_language, version),
      CHECK (
        (status = 'active' AND retired_at IS NULL AND superseded_by_answer_id IS NULL)
        OR (status = 'retired' AND retired_at IS NOT NULL AND superseded_by_answer_id IS NOT NULL)
      )
    ) STRICT;

    CREATE UNIQUE INDEX approved_answers_active_question_language_idx
      ON approved_answers (normalized_question, answer_language)
      WHERE status = 'active';
    CREATE INDEX approved_answers_source_review_idx
      ON approved_answers (source_review_item_id, version);

    CREATE TRIGGER approved_answers_no_delete
    BEFORE DELETE ON approved_answers BEGIN
      SELECT RAISE(ABORT, 'approved answers are append-only');
    END;

    CREATE TRIGGER approved_answers_retirement_only
    BEFORE UPDATE ON approved_answers
    WHEN NOT (
      OLD.status = 'active' AND NEW.status = 'retired'
      AND OLD.id IS NEW.id
      AND OLD.normalized_question IS NEW.normalized_question
      AND OLD.question_text IS NEW.question_text
      AND OLD.answer_language IS NEW.answer_language
      AND OLD.answer_text IS NEW.answer_text
      AND OLD.evidence_references IS NEW.evidence_references
      AND OLD.source_review_item_id IS NEW.source_review_item_id
      AND OLD.source_decision_id IS NEW.source_decision_id
      AND OLD.version IS NEW.version
      AND OLD.reviewer_id IS NEW.reviewer_id
      AND OLD.approved_at IS NEW.approved_at
      AND OLD.created_at IS NEW.created_at
      AND NEW.retired_at IS NOT NULL
      AND NEW.superseded_by_answer_id IS NOT NULL
    ) BEGIN
      SELECT RAISE(ABORT, 'approved answer versions are immutable');
    END;
  `,
] as const;

export function migrateApprovedAnswerDatabase(database: DatabaseSync): void {
  requireTable(database, 'question_logs');
  requireTable(database, 'review_items');
  requireTable(database, 'review_decisions');

  database.exec(`
    CREATE TABLE IF NOT EXISTS approved_answer_schema_migrations (
      feature TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      applied_at TEXT NOT NULL,
      PRIMARY KEY (feature, version)
    ) STRICT;
  `);
  const rows = database.prepare(`
    SELECT version FROM approved_answer_schema_migrations WHERE feature = ? ORDER BY version
  `).all(feature) as unknown as Array<{ version: number }>;
  const versions = rows.map((row) => row.version);
  if (versions.some((version, index) => version !== index + 1)) {
    throw new Error('Approved-answer database migration history is incomplete or unsupported.');
  }
  if (versions.length > migrations.length) {
    throw new Error(`Approved-answer database schema version ${versions.length} is newer than supported.`);
  }

  for (let index = versions.length; index < migrations.length; index += 1) {
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(migrations[index]);
      if (index === 0) backfillApprovedAnswers(database);
      database.prepare(`
        INSERT INTO approved_answer_schema_migrations (feature, version, applied_at)
        VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(feature, index + 1);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }
}

interface ExistingApprovalRow {
  answer: string | null;
  answer_language: string;
  corrected_answer: string | null;
  created_at: string;
  decision_id: string;
  evidence_references: string;
  question: string;
  review_item_id: string;
  reviewer_id: string;
}

function backfillApprovedAnswers(database: DatabaseSync): void {
  const rows = database.prepare(`
    SELECT q.question, q.answer_language, q.answer, q.evidence_references,
      r.id AS review_item_id, d.id AS decision_id, d.corrected_answer,
      d.reviewer_id, d.created_at
    FROM review_decisions d
    JOIN review_items r ON r.id = d.review_item_id
    JOIN question_logs q ON q.id = r.question_log_id
    WHERE d.outcome = 'approved' AND r.status = 'approved'
      AND q.status = 'answered'
      AND COALESCE(d.corrected_answer, q.answer) IS NOT NULL
      AND length(trim(COALESCE(d.corrected_answer, q.answer))) > 0
      AND json_valid(q.evidence_references)
      AND json_type(q.evidence_references) = 'array'
      AND json_array_length(q.evidence_references) > 0
    ORDER BY d.created_at, d.id
  `).all() as unknown as ExistingApprovalRow[];

  for (const row of rows) {
    const references = JSON.parse(row.evidence_references) as unknown;
    if (!Array.isArray(references)
      || references.length === 0
      || !references.every((item) => typeof item === 'string' && item.length > 0)) continue;
    const normalizedQuestion = normalizeApprovedQuestion(row.question);
    const id = `migration:approved:${row.decision_id}`;
    const latest = database.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version FROM approved_answers
      WHERE normalized_question = ? AND answer_language = ?
    `).get(normalizedQuestion, row.answer_language) as unknown as { version: number };
    database.prepare(`
      UPDATE approved_answers
      SET status = 'retired', retired_at = ?, superseded_by_answer_id = ?
      WHERE normalized_question = ? AND answer_language = ? AND status = 'active'
    `).run(row.created_at, id, normalizedQuestion, row.answer_language);
    database.prepare(`
      INSERT INTO approved_answers (
        id, normalized_question, question_text, answer_language, answer_text,
        evidence_references, source_review_item_id, source_decision_id, version,
        status, reviewer_id, approved_at, created_at, retired_at,
        superseded_by_answer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL)
    `).run(
      id,
      normalizedQuestion,
      row.question,
      row.answer_language,
      row.corrected_answer ?? row.answer,
      JSON.stringify(references),
      row.review_item_id,
      row.decision_id,
      latest.version + 1,
      row.reviewer_id,
      row.created_at,
      row.created_at,
    );
  }
}

function requireTable(database: DatabaseSync, table: string): void {
  const row = database.prepare(`
    SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(table) as unknown as { present: number } | undefined;
  if (!row) throw new Error(`Approved-answer storage requires the ${table} table.`);
}
