import type { DatabaseSync } from 'node:sqlite';
import type { FeedbackListQuery, FeedbackPage } from '../../../shared/contracts/feedback.ts';
import { type FeedbackRow, toFeedbackSummary } from './sqlite-feedback-rows.ts';

export function listFeedback(database: DatabaseSync, query: FeedbackListQuery): FeedbackPage {
  const { clause, parameters } = filters(query);
  const rows = database.prepare(`
    SELECT f.*, r.status AS review_status
    FROM feedback_entries f LEFT JOIN review_items r ON r.id = f.review_item_id
    ${clause} ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?
  `).all(...parameters, query.limit, query.offset) as unknown as FeedbackRow[];
  const count = database.prepare(`
    SELECT COUNT(*) AS total
    FROM feedback_entries f LEFT JOIN review_items r ON r.id = f.review_item_id ${clause}
  `).get(...parameters) as unknown as { total: number };
  return {
    items: rows.map(toFeedbackSummary),
    limit: query.limit,
    offset: query.offset,
    total: count.total,
  };
}

function filters(query: FeedbackListQuery): { clause: string; parameters: string[] } {
  const predicates: string[] = [];
  const parameters: string[] = [];
  for (const [column, value] of [
    ['f.answer_language', query.language],
    ['f.channel', query.channel],
    ['f.rating', query.rating],
  ] as const) {
    if (value !== undefined) {
      predicates.push(`${column} = ?`);
      parameters.push(value);
    }
  }
  if (query.reason !== undefined) {
    predicates.push('EXISTS (SELECT 1 FROM json_each(f.reasons) WHERE value = ?)');
    parameters.push(query.reason);
  }
  if (query.reviewStatus === 'none') predicates.push('r.id IS NULL');
  else if (query.reviewStatus !== undefined) {
    predicates.push('r.status = ?');
    parameters.push(query.reviewStatus);
  }
  return { clause: predicates.length ? `WHERE ${predicates.join(' AND ')}` : '', parameters };
}
