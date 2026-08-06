import type { DatabaseSync } from 'node:sqlite';
import type {
  ReviewEvent,
  ReviewEventType,
  ReviewStatus,
} from '../../../shared/contracts/reviews.ts';

interface ReviewEventRow {
  created_at: string;
  decision_id: string | null;
  event_type: string;
  from_status: string | null;
  id: string;
  review_item_id: string;
  reviewer_id: string | null;
  to_status: string;
}

export function insertReviewEvent(database: DatabaseSync, event: ReviewEvent): void {
  database.prepare(`
    INSERT INTO review_events (
      id, review_item_id, event_type, from_status, to_status,
      reviewer_id, decision_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.reviewItemId,
    event.type,
    event.fromStatus,
    event.toStatus,
    event.reviewerId,
    event.decisionId,
    event.createdAt,
  );
}

export function readReviewEvents(database: DatabaseSync, reviewItemId: string): ReviewEvent[] {
  const rows = database.prepare(`
    SELECT * FROM review_events WHERE review_item_id = ? ORDER BY sequence ASC
  `).all(reviewItemId) as unknown as ReviewEventRow[];
  return rows.map((row) => ({
    createdAt: row.created_at,
    decisionId: row.decision_id,
    fromStatus: row.from_status as ReviewStatus | null,
    id: row.id,
    reviewerId: row.reviewer_id,
    reviewItemId: row.review_item_id,
    toStatus: row.to_status as ReviewStatus,
    type: row.event_type as ReviewEventType,
  }));
}
