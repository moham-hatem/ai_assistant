import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ReviewEvent,
  ReviewItem,
  ReviewListQuery,
  ReviewPage,
} from '../../../shared/contracts/reviews.ts';
import type {
  ApprovedAnswer,
  ApprovedAnswerLookup,
  ApprovedAnswerStatus,
} from '../../../shared/contracts/approved-answers.ts';
import type {
  ApprovedAnswerApproval,
  ApprovedAnswerRepository,
} from '../approved-answers/approved-answer-repository.ts';
import { migrateApprovedAnswerDatabase } from '../approved-answers/sqlite-approved-answer-migrations.ts';
import {
  ConcurrentReviewUpdateError,
  DuplicateReviewError,
  QuestionLogMissingError,
  type ReviewRepository,
  type ReviewTransitionCommand,
  type SaveReviewDecisionCommand,
} from './review-repository.ts';
import { migrateReviewDatabase } from './sqlite-review-migrations.ts';
import { insertReviewEvent, readReviewEvents } from './sqlite-review-events.ts';
import { listReviewQueue } from './sqlite-review-list.ts';
import {
  type ReviewDecisionRow,
  type ReviewItemRow,
  toReviewDecision,
  toReviewItem,
} from './sqlite-review-rows.ts';

interface ApprovedAnswerRow {
  answer_language: string;
  answer_text: string;
  approved_at: string;
  created_at: string;
  evidence_references: string;
  id: string;
  normalized_question: string;
  question_text: string;
  retired_at: string | null;
  reviewer_id: string;
  source_decision_id: string;
  source_review_item_id: string;
  status: string;
  superseded_by_answer_id: string | null;
  version: number;
}

export class SqliteReviewRepository implements ReviewRepository, ApprovedAnswerRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateReviewDatabase(this.database);
    migrateApprovedAnswerDatabase(this.database);
  }

  async createFromQuestionLog(item: ReviewItem, event: ReviewEvent): Promise<void> {
    try {
      transaction(this.database, () => {
        const result = this.database.prepare(`
          INSERT INTO review_items (
            id, question_log_id, status, assigned_reviewer_id,
            created_at, updated_at, claimed_at, decided_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM question_logs WHERE id = ?
        `).run(
          item.id,
          item.questionLogId,
          item.status,
          item.assignedReviewerId,
          item.createdAt,
          item.updatedAt,
          item.claimedAt,
          item.decidedAt,
          item.questionLogId,
        );
        if (result.changes !== 1) throw new QuestionLogMissingError();
        insertReviewEvent(this.database, event);
      });
    } catch (error) {
      if (isDuplicateReview(error)) throw new DuplicateReviewError();
      throw error;
    }
  }

  async findItem(id: string): Promise<ReviewItem | undefined> {
    const row = this.database.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as
      unknown as ReviewItemRow | undefined;
    return row ? toReviewItem(row) : undefined;
  }

  async findDecision(reviewItemId: string) {
    const row = this.database.prepare(`
      SELECT * FROM review_decisions WHERE review_item_id = ?
    `).get(reviewItemId) as unknown as ReviewDecisionRow | undefined;
    return row ? toReviewDecision(row) : undefined;
  }

  async findEvents(reviewItemId: string): Promise<ReviewEvent[]> {
    return readReviewEvents(this.database, reviewItemId);
  }

  async findActiveExact(query: ApprovedAnswerLookup): Promise<ApprovedAnswer | undefined> {
    const row = this.database.prepare(`
      SELECT a.* FROM approved_answers a
      JOIN review_items r ON r.id = a.source_review_item_id
      JOIN review_decisions d ON d.id = a.source_decision_id
      WHERE a.normalized_question = ? AND a.answer_language = ? AND a.status = 'active'
        AND r.status = 'approved' AND d.outcome = 'approved'
      LIMIT 1
    `).get(query.normalizedQuestion, query.answerLanguage) as unknown as
      ApprovedAnswerRow | undefined;
    return row ? toApprovedAnswer(row) : undefined;
  }

  async list(query: ReviewListQuery): Promise<ReviewPage> {
    return listReviewQueue(this.database, query);
  }

  async transition(command: ReviewTransitionCommand): Promise<ReviewItem> {
    return transaction(this.database, () => {
      const claiming = command.targetStatus === 'in_review';
      const result = this.database.prepare(`
        UPDATE review_items SET
          status = ?, assigned_reviewer_id = ?, claimed_at = ?, updated_at = ?
        WHERE id = ? AND status = ?
          AND (assigned_reviewer_id IS NULL OR assigned_reviewer_id = ?)
      `).run(
        command.targetStatus,
        claiming ? command.reviewerId : null,
        claiming ? command.at : null,
        command.at,
        command.reviewItemId,
        command.expectedStatus,
        command.reviewerId,
      );
      if (result.changes !== 1) throw new ConcurrentReviewUpdateError();
      insertReviewEvent(this.database, {
        createdAt: command.at,
        decisionId: null,
        fromStatus: command.expectedStatus,
        id: command.eventId,
        reviewerId: command.reviewerId,
        reviewItemId: command.reviewItemId,
        toStatus: command.targetStatus,
        type: command.eventType,
      });
      return this.requireItem(command.reviewItemId);
    });
  }

  async saveDecision(command: SaveReviewDecisionCommand): Promise<ReviewItem> {
    try {
      return transaction(this.database, () => {
        const decision = command.decision;
        this.database.prepare(`
          INSERT INTO review_decisions (
            id, review_item_id, outcome, reviewer_id, internal_notes,
            corrected_answer, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          decision.id,
          decision.reviewItemId,
          decision.outcome,
          decision.reviewerId,
          decision.internalNotes,
          decision.correctedAnswer,
          decision.createdAt,
        );
        const result = this.database.prepare(`
          UPDATE review_items SET status = ?, assigned_reviewer_id = COALESCE(
            assigned_reviewer_id, ?
          ), updated_at = ?, decided_at = ?
          WHERE id = ? AND status = ?
            AND (assigned_reviewer_id IS NULL OR assigned_reviewer_id = ?)
        `).run(
          command.targetStatus,
          decision.reviewerId,
          decision.createdAt,
          decision.createdAt,
          decision.reviewItemId,
          command.expectedStatus,
          decision.reviewerId,
        );
        if (result.changes !== 1) throw new ConcurrentReviewUpdateError();
        insertReviewEvent(this.database, {
          createdAt: decision.createdAt,
          decisionId: decision.id,
          fromStatus: command.expectedStatus,
          id: command.eventId,
          reviewerId: decision.reviewerId,
          reviewItemId: decision.reviewItemId,
          toStatus: command.targetStatus,
          type: 'decision_saved',
        });
        if (command.approvedAnswer) this.saveApprovedAnswer(command.approvedAnswer);
        return this.requireItem(decision.reviewItemId);
      });
    } catch (error) {
      if (isDuplicateDecision(error)) throw new ConcurrentReviewUpdateError();
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private requireItem(id: string): ReviewItem {
    const row = this.database.prepare('SELECT * FROM review_items WHERE id = ?').get(id) as
      unknown as ReviewItemRow | undefined;
    if (!row) throw new ConcurrentReviewUpdateError();
    return toReviewItem(row);
  }

  private saveApprovedAnswer(answer: ApprovedAnswerApproval): void {
    const latest = this.database.prepare(`
      SELECT COALESCE(MAX(version), 0) AS version
      FROM approved_answers
      WHERE normalized_question = ? AND answer_language = ?
    `).get(answer.normalizedQuestion, answer.answerLanguage) as unknown as { version: number };
    this.database.prepare(`
      UPDATE approved_answers
      SET status = 'retired', retired_at = ?, superseded_by_answer_id = ?
      WHERE normalized_question = ? AND answer_language = ? AND status = 'active'
    `).run(
      answer.approvedAt,
      answer.id,
      answer.normalizedQuestion,
      answer.answerLanguage,
    );
    this.database.prepare(`
      INSERT INTO approved_answers (
        id, normalized_question, question_text, answer_language, answer_text,
        evidence_references, source_review_item_id, source_decision_id, version,
        status, reviewer_id, approved_at, created_at, retired_at,
        superseded_by_answer_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL)
    `).run(
      answer.id,
      answer.normalizedQuestion,
      answer.question,
      answer.answerLanguage,
      answer.answer,
      JSON.stringify(answer.evidenceReferences),
      answer.sourceReviewItemId,
      answer.sourceDecisionId,
      latest.version + 1,
      answer.reviewerId,
      answer.approvedAt,
      answer.approvedAt,
    );
  }
}

function transaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = operation();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function isDuplicateReview(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed: review_items.question_log_id');
}

function isDuplicateDecision(error: unknown): boolean {
  return error instanceof Error
    && error.message.includes('UNIQUE constraint failed: review_decisions.review_item_id');
}

function toApprovedAnswer(row: ApprovedAnswerRow): ApprovedAnswer {
  return {
    answer: row.answer_text,
    answerLanguage: row.answer_language,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    evidenceReferences: parseEvidenceReferences(row.evidence_references),
    id: row.id,
    normalizedQuestion: row.normalized_question,
    question: row.question_text,
    retiredAt: row.retired_at,
    reviewerId: row.reviewer_id,
    sourceDecisionId: row.source_decision_id,
    sourceReviewItemId: row.source_review_item_id,
    status: row.status as ApprovedAnswerStatus,
    supersededByAnswerId: row.superseded_by_answer_id,
    version: row.version,
  };
}

function parseEvidenceReferences(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)
      || parsed.length === 0
      || !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) return [];
    return parsed.map((item) => item.trim());
  } catch {
    return [];
  }
}
