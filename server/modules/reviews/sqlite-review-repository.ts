import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  ReviewItem,
  ReviewListQuery,
  ReviewPage,
} from '../../../shared/contracts/reviews.ts';
import {
  ConcurrentReviewUpdateError,
  DuplicateReviewError,
  QuestionLogMissingError,
  type ReviewRepository,
  type ReviewTransitionCommand,
  type SaveReviewDecisionCommand,
} from './review-repository.ts';
import { migrateReviewDatabase } from './sqlite-review-migrations.ts';
import {
  type ReviewDecisionRow,
  type ReviewItemRow,
  type ReviewQueueRow,
  toQueueEntry,
  toReviewDecision,
  toReviewItem,
} from './sqlite-review-rows.ts';

export class SqliteReviewRepository implements ReviewRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateReviewDatabase(this.database);
  }

  async createFromQuestionLog(item: ReviewItem): Promise<void> {
    try {
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

  async list(query: ReviewListQuery): Promise<ReviewPage> {
    const { clause, parameters } = filters(query);
    const rows = this.database.prepare(`
      SELECT r.*,
        q.id AS q_id, q.question AS q_question, q.answer_language AS q_answer_language,
        q.channel AS q_channel, q.status AS q_status, q.started_at AS q_started_at,
        q.completed_at AS q_completed_at, q.latency_ms AS q_latency_ms,
        q.provider AS q_provider, q.model AS q_model, q.grounded AS q_grounded,
        q.sufficiency AS q_sufficiency
      FROM review_items r JOIN question_logs q ON q.id = r.question_log_id
      ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
    `).all(...parameters, query.limit, query.offset) as unknown as ReviewQueueRow[];
    const count = this.database.prepare(`
      SELECT COUNT(*) AS total
      FROM review_items r JOIN question_logs q ON q.id = r.question_log_id ${clause}
    `).get(...parameters) as unknown as { total: number };
    return {
      items: rows.map(toQueueEntry),
      limit: query.limit,
      offset: query.offset,
      total: count.total,
    };
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
}

function filters(query: ReviewListQuery): { clause: string; parameters: string[] } {
  const predicates: string[] = [];
  const parameters: string[] = [];
  for (const [column, value] of [
    ['q.answer_language', query.answerLanguage],
    ['q.channel', query.channel],
    ['r.assigned_reviewer_id', query.reviewerId],
    ['r.status', query.status],
  ] as const) {
    if (value !== undefined) {
      predicates.push(`${column} = ?`);
      parameters.push(value);
    }
  }
  return { clause: predicates.length ? `WHERE ${predicates.join(' AND ')}` : '', parameters };
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
