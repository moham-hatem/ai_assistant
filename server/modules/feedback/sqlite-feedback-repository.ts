import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  FeedbackDetail,
  FeedbackListQuery,
  FeedbackPage,
  FeedbackSubmissionResult,
} from '../../../shared/contracts/feedback.ts';
import { normalizeApprovedQuestion } from '../approved-answers/approved-answer-domain.ts';
import { insertReviewEvent } from '../reviews/sqlite-review-events.ts';
import { sha256 } from './feedback-digest.ts';
import {
  FeedbackIdempotencyConflictError,
  FeedbackQuestionLogMissingError,
  type FeedbackRepository,
  type SubmitFeedbackCommand,
} from './feedback-repository.ts';
import { listFeedback } from './sqlite-feedback-list.ts';
import { migrateFeedbackDatabase } from './sqlite-feedback-migrations.ts';
import {
  type FeedbackDetailRow,
  type FeedbackRow,
  toFeedbackRecord,
  toReviewItem,
} from './sqlite-feedback-rows.ts';

interface QuestionSnapshotRow {
  answer_language: string;
  channel: string;
  question: string;
}

export class SqliteFeedbackRepository implements FeedbackRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    migrateFeedbackDatabase(this.database);
  }

  async submit(command: SubmitFeedbackCommand): Promise<FeedbackSubmissionResult> {
    return transaction(this.database, () => {
      const existing = this.findBySubmissionDigest(command.submissionDigest);
      if (existing) {
        if (existing.payload_digest !== command.payloadDigest) {
          throw new FeedbackIdempotencyConflictError();
        }
        return toSubmissionResult(existing);
      }

      const question = this.database.prepare(`
        SELECT question, answer_language, channel FROM question_logs WHERE id = ?
      `).get(command.questionLogId) as unknown as QuestionSnapshotRow | undefined;
      if (!question) throw new FeedbackQuestionLogMissingError();
      const normalized = normalizeApprovedQuestion(question.question);
      const questionDigest = sha256(normalized || `question-log:${command.questionLogId}`);

      this.database.prepare(`
        INSERT INTO feedback_entries (
          id, question_log_id, submission_digest, payload_digest, question_digest,
          rating, reasons, comment, answer_language, channel, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        command.feedbackId,
        command.questionLogId,
        command.submissionDigest,
        command.payloadDigest,
        questionDigest,
        command.rating,
        JSON.stringify(command.reasons),
        command.comment,
        question.answer_language,
        question.channel,
        command.createdAt,
      );

      if (this.shouldCreateReview(command, questionDigest, question.answer_language)) {
        this.linkReview(command);
      }
      return toSubmissionResult(this.requireFeedback(command.feedbackId));
    });
  }

  async findDetail(id: string): Promise<FeedbackDetail | undefined> {
    const row = this.database.prepare(`
      SELECT f.*, r.status AS review_status,
        r.question_log_id AS r_question_log_id,
        r.status AS r_status,
        r.assigned_reviewer_id AS r_assigned_reviewer_id,
        r.created_at AS r_created_at,
        r.updated_at AS r_updated_at,
        r.claimed_at AS r_claimed_at,
        r.decided_at AS r_decided_at
      FROM feedback_entries f LEFT JOIN review_items r ON r.id = f.review_item_id
      WHERE f.id = ?
    `).get(id) as unknown as FeedbackDetailRow | undefined;
    return row ? { feedback: toFeedbackRecord(row), review: toReviewItem(row) } : undefined;
  }

  async list(query: FeedbackListQuery): Promise<FeedbackPage> {
    return listFeedback(this.database, query);
  }

  close(): void {
    this.database.close();
  }

  private shouldCreateReview(
    command: SubmitFeedbackCommand,
    questionDigest: string,
    language: string,
  ): boolean {
    if (command.rating !== 'unhelpful') return false;
    if (command.escalateImmediately) return true;
    const count = this.database.prepare(`
      SELECT COUNT(*) AS total FROM feedback_entries
      WHERE rating = 'unhelpful' AND question_digest = ? AND answer_language = ?
    `).get(questionDigest, language) as unknown as { total: number };
    return count.total >= command.unhelpfulThreshold;
  }

  private linkReview(command: SubmitFeedbackCommand): void {
    const existing = this.database.prepare(`
      SELECT id FROM review_items WHERE question_log_id = ?
    `).get(command.questionLogId) as unknown as { id: string } | undefined;
    const reviewId = existing?.id ?? command.reviewId;
    const created = existing === undefined;
    if (created) {
      this.database.prepare(`
        INSERT INTO review_items (
          id, question_log_id, status, assigned_reviewer_id,
          created_at, updated_at, claimed_at, decided_at
        ) VALUES (?, ?, 'pending', NULL, ?, ?, NULL, NULL)
      `).run(reviewId, command.questionLogId, command.createdAt, command.createdAt);
      insertReviewEvent(this.database, {
        createdAt: command.createdAt,
        decisionId: null,
        fromStatus: null,
        id: command.reviewEventId,
        reviewerId: null,
        reviewItemId: reviewId,
        toStatus: 'pending',
        type: 'created',
      });
    }
    this.database.prepare(`
      UPDATE feedback_entries SET review_item_id = ?, review_created = ? WHERE id = ?
    `).run(reviewId, Number(created), command.feedbackId);
  }

  private findBySubmissionDigest(digest: string): FeedbackRow | undefined {
    return this.database.prepare(`
      SELECT f.*, r.status AS review_status
      FROM feedback_entries f LEFT JOIN review_items r ON r.id = f.review_item_id
      WHERE f.submission_digest = ?
    `).get(digest) as unknown as FeedbackRow | undefined;
  }

  private requireFeedback(id: string): FeedbackRow {
    const row = this.database.prepare(`
      SELECT f.*, r.status AS review_status
      FROM feedback_entries f LEFT JOIN review_items r ON r.id = f.review_item_id
      WHERE f.id = ?
    `).get(id) as unknown as FeedbackRow | undefined;
    if (!row) throw new Error('Feedback disappeared inside its transaction.');
    return row;
  }
}

function toSubmissionResult(row: FeedbackRow): FeedbackSubmissionResult {
  return {
    feedback: toFeedbackRecord(row),
    review: {
      created: row.review_created === 1,
      reviewId: row.review_item_id,
    },
  };
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
