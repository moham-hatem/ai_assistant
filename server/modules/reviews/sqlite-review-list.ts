import type { DatabaseSync } from 'node:sqlite';
import type { ReviewListQuery, ReviewPage } from '../../../shared/contracts/reviews.ts';
import { type ReviewQueueRow, toQueueEntry } from './sqlite-review-rows.ts';

export function listReviewQueue(database: DatabaseSync, query: ReviewListQuery): ReviewPage {
  const { clause, parameters } = filters(query);
  const rows = database.prepare(`
    SELECT r.*,
      q.id AS q_id, q.question AS q_question, q.answer_language AS q_answer_language,
      q.channel AS q_channel, q.status AS q_status, q.started_at AS q_started_at,
      q.completed_at AS q_completed_at, q.latency_ms AS q_latency_ms,
      q.provider AS q_provider, q.model AS q_model, q.grounded AS q_grounded,
      q.sufficiency AS q_sufficiency
    FROM review_items r JOIN question_logs q ON q.id = r.question_log_id
    ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?
  `).all(...parameters, query.limit, query.offset) as unknown as ReviewQueueRow[];
  const count = database.prepare(`
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
