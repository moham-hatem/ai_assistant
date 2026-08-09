import { DatabaseSync } from 'node:sqlite';
import type { QualityMetricsFilters } from '../../../shared/contracts/quality-metrics.ts';
import type {
  QualityMetricEvidence,
  QualityMetricEvidenceGroup,
  QualityMetricsRepository,
  QualityMetricsSnapshot,
} from './quality-metrics-repository.ts';
import {
  dimensionExpression,
  feedbackTimeConditions,
  feedbackWhere,
  groupByDimension,
  questionWhere,
  type QualityMetricsDimension,
} from './quality-metrics-sql.ts';

interface AggregateRow {
  answer_attempts?: number;
  answered?: number;
  approved_answer_usage_count?: number;
  declined?: number;
  escalated_count?: number;
  failed?: number;
  feedback_count?: number;
  feedback_covered_answer_attempts?: number;
  helpful?: number;
  metric_key: string | null;
  open_review_count?: number;
  unhelpful?: number;
}

interface ClosureRow { duration_ms: number; metric_key: string | null }

export class SqliteQualityMetricsRepository implements QualityMetricsRepository {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path, { readOnly: path !== ':memory:' });
    this.database.exec('PRAGMA busy_timeout = 5000;');
    requireTables(this.database);
  }

  async read(filters: QualityMetricsFilters): Promise<QualityMetricsSnapshot> {
    this.database.exec('BEGIN;');
    try {
      const snapshot = {
        byChannel: this.readDimension(filters, 'channel'),
        byLanguage: this.readDimension(filters, 'language'),
        totals: this.readDimension(filters, 'total')[0] ?? emptyEvidence(),
      };
      this.database.exec('COMMIT;');
      return snapshot;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  private readDimension(
    filters: QualityMetricsFilters,
    dimension: QualityMetricsDimension,
  ): QualityMetricEvidenceGroup[] {
    const evidence = new Map<string, QualityMetricEvidenceGroup>();
    mergeRows(evidence, this.attemptRows(filters, dimension));
    mergeRows(evidence, this.feedbackRows(filters, dimension));
    mergeRows(evidence, this.coverageRows(filters, dimension));
    mergeRows(evidence, this.openReviewRows(filters, dimension));
    mergeRows(evidence, this.approvedUsageRows(filters, dimension));
    mergeClosures(evidence, this.closureRows(filters, dimension));
    if (dimension === 'total' && evidence.size === 0) evidence.set('', { key: '', ...emptyEvidence() });
    return [...evidence.values()].sort((left, right) => left.key.localeCompare(right.key));
  }

  private attemptRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension) {
    const key = dimensionExpression(dimension, 'q');
    const where = questionWhere(filters, 'q', 'started_at');
    return this.all(`SELECT ${key} AS metric_key, COUNT(*) AS answer_attempts,
      SUM(q.status = 'answered') AS answered, SUM(q.status = 'declined') AS declined,
      SUM(q.status = 'failed') AS failed FROM question_logs q ${where.clause}
      ${groupByDimension(dimension, key)}`, where.values);
  }

  private feedbackRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension) {
    const key = dimensionExpression(dimension, 'f');
    const where = feedbackWhere(filters, 'f');
    return this.all(`SELECT ${key} AS metric_key, COUNT(*) AS feedback_count,
      SUM(f.rating = 'helpful') AS helpful, SUM(f.rating = 'unhelpful') AS unhelpful,
      SUM(f.review_item_id IS NOT NULL) AS escalated_count
      FROM feedback_entries f ${where.clause} ${groupByDimension(dimension, key)}`, where.values);
  }

  private coverageRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension) {
    const key = dimensionExpression(dimension, 'q');
    const questions = questionWhere(filters, 'q', 'started_at');
    const feedback = feedbackTimeConditions(filters, 'f');
    const feedbackClause = feedback.clause.replace(/^WHERE /u, 'AND ');
    return this.all(`SELECT ${key} AS metric_key,
      COUNT(DISTINCT q.id) AS feedback_covered_answer_attempts
      FROM question_logs q JOIN feedback_entries f ON f.question_log_id = q.id
      ${questions.clause} ${feedbackClause} ${groupByDimension(dimension, key)}`,
    [...questions.values, ...feedback.values]);
  }

  private openReviewRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension) {
    const key = dimensionExpression(dimension, 'q');
    const where = questionWhere(filters, 'q', null);
    const status = where.clause ? "AND r.status IN ('pending', 'in_review')" : "WHERE r.status IN ('pending', 'in_review')";
    return this.all(`SELECT ${key} AS metric_key, COUNT(*) AS open_review_count
      FROM review_items r JOIN question_logs q ON q.id = r.question_log_id
      ${where.clause} ${status} ${groupByDimension(dimension, key)}`, where.values);
  }

  private closureRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension): ClosureRow[] {
    const key = dimensionExpression(dimension, 'q');
    const where = questionWhere(filters, 'q', 'decided_at', 'r');
    const decided = where.clause ? 'AND r.decided_at IS NOT NULL' : 'WHERE r.decided_at IS NOT NULL';
    return this.database.prepare(`SELECT ${key} AS metric_key,
      CAST(ROUND((julianday(r.decided_at) - julianday(r.created_at)) * 86400000) AS INTEGER) AS duration_ms
      FROM review_items r JOIN question_logs q ON q.id = r.question_log_id
      ${where.clause} ${decided} ORDER BY duration_ms`).all(...where.values) as unknown as ClosureRow[];
  }

  private approvedUsageRows(filters: QualityMetricsFilters, dimension: QualityMetricsDimension) {
    const key = dimensionExpression(dimension, 'q');
    const where = questionWhere(filters, 'q', 'started_at');
    const provider = where.clause ? "AND q.provider = 'approved-answer'" : "WHERE q.provider = 'approved-answer'";
    return this.all(`SELECT ${key} AS metric_key, COUNT(*) AS approved_answer_usage_count
      FROM question_logs q ${where.clause} ${provider} ${groupByDimension(dimension, key)}`,
    where.values);
  }

  private all(sql: string, values: string[]): AggregateRow[] {
    return this.database.prepare(sql).all(...values) as unknown as AggregateRow[];
  }
}

function mergeRows(target: Map<string, QualityMetricEvidenceGroup>, rows: AggregateRow[]): void {
  for (const row of rows) {
    const key = row.metric_key ?? '';
    const item = target.get(key) ?? { key, ...emptyEvidence() };
    for (const field of aggregateFields) {
      const value = row[field];
      if (typeof value === 'number') item[toEvidenceField[field]] = value;
    }
    target.set(key, item);
  }
}

function mergeClosures(target: Map<string, QualityMetricEvidenceGroup>, rows: ClosureRow[]): void {
  for (const row of rows) {
    const key = row.metric_key ?? '';
    const item = target.get(key) ?? { key, ...emptyEvidence() };
    item.closureDurationsMs.push(row.duration_ms);
    target.set(key, item);
  }
}

const aggregateFields = [
  'answer_attempts', 'answered', 'approved_answer_usage_count', 'declined',
  'escalated_count', 'failed', 'feedback_count', 'feedback_covered_answer_attempts',
  'helpful', 'open_review_count', 'unhelpful',
] as const;

const toEvidenceField = {
  answer_attempts: 'answerAttempts', answered: 'answered',
  approved_answer_usage_count: 'approvedAnswerUsageCount', declined: 'declined',
  escalated_count: 'escalatedCount', failed: 'failed', feedback_count: 'feedbackCount',
  feedback_covered_answer_attempts: 'feedbackCoveredAnswerAttempts', helpful: 'helpful',
  open_review_count: 'openReviewCount', unhelpful: 'unhelpful',
} as const;

function emptyEvidence(): QualityMetricEvidence {
  return {
    answerAttempts: 0, answered: 0, approvedAnswerUsageCount: 0,
    closureDurationsMs: [], declined: 0, escalatedCount: 0, failed: 0,
    feedbackCount: 0, feedbackCoveredAnswerAttempts: 0, helpful: 0,
    openReviewCount: 0, unhelpful: 0,
  };
}

function requireTables(database: DatabaseSync): void {
  for (const table of ['question_logs', 'feedback_entries', 'review_items', 'approved_answers']) {
    const row = database.prepare(`SELECT 1 AS present FROM sqlite_master
      WHERE type = 'table' AND name = ?`).get(table) as unknown as { present: number } | undefined;
    if (!row) throw new Error(`Quality metrics require the ${table} table.`);
  }
}
