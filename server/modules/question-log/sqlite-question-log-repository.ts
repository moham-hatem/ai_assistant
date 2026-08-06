import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type {
  EvidenceSufficiency,
  QuestionLogChannel,
  QuestionLogListQuery,
  QuestionLogPage,
  QuestionLogRecord,
  QuestionLogStatus,
  QuestionLogSummary,
} from '../../../shared/contracts/question-log.ts';
import type { QuestionLogRepository } from './question-log-repository.ts';

interface StoredQuestionLogRow {
  answer: string | null;
  answer_language: string;
  apology: string | null;
  channel: string;
  completed_at: string;
  evidence_references?: string;
  grounded: number | null;
  id: string;
  latency_ms: number;
  model: string | null;
  provider: string | null;
  question: string;
  started_at: string;
  status: string;
  sufficiency: string;
}

const schema = `
  CREATE TABLE IF NOT EXISTS question_logs (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer_language TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('answered', 'declined', 'failed')),
    answer TEXT,
    apology TEXT,
    evidence_references TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(evidence_references)),
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
    provider TEXT,
    model TEXT,
    grounded INTEGER CHECK (grounded IN (0, 1) OR grounded IS NULL),
    sufficiency TEXT NOT NULL CHECK (sufficiency IN ('sufficient', 'insufficient', 'unknown')),
    CHECK (
      (status = 'answered' AND answer IS NOT NULL AND apology IS NULL)
      OR (status IN ('declined', 'failed') AND answer IS NULL AND apology IS NOT NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS question_logs_started_at_idx
    ON question_logs (started_at DESC, id DESC);
`;

export class SqliteQuestionLogRepository implements QuestionLogRepository {
  private readonly database: DatabaseSync;
  private readonly findStatement: StatementSync;
  private readonly insertStatement: StatementSync;
  private readonly listStatement: StatementSync;
  private readonly totalStatement: StatementSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec(schema);
    this.insertStatement = this.database.prepare(`
      INSERT INTO question_logs (
        id, question, answer_language, channel, status, answer, apology,
        evidence_references, started_at, completed_at, latency_ms,
        provider, model, grounded, sufficiency
      ) VALUES (
        $id, $question, $answerLanguage, $channel, $status, $answer, $apology,
        $evidenceReferences, $startedAt, $completedAt, $latencyMs,
        $provider, $model, $grounded, $sufficiency
      )
    `);
    this.findStatement = this.database.prepare('SELECT * FROM question_logs WHERE id = ?');
    this.listStatement = this.database.prepare(`
      SELECT id, question, answer_language, channel, status, started_at,
        completed_at, latency_ms, provider, model, grounded, sufficiency
      FROM question_logs
      ORDER BY started_at DESC, id DESC
      LIMIT ? OFFSET ?
    `);
    this.totalStatement = this.database.prepare('SELECT COUNT(*) AS total FROM question_logs');
  }

  async save(record: QuestionLogRecord): Promise<void> {
    this.insertStatement.run({
      answer: record.answer,
      answerLanguage: record.answerLanguage,
      apology: record.apology,
      channel: record.channel,
      completedAt: record.completedAt,
      evidenceReferences: JSON.stringify(record.evidenceReferences),
      grounded: record.grounded === null ? null : Number(record.grounded),
      id: record.id,
      latencyMs: record.latencyMs,
      model: record.model,
      provider: record.provider,
      question: record.question,
      startedAt: record.startedAt,
      status: record.status,
      sufficiency: record.sufficiency,
    });
  }

  async findById(id: string): Promise<QuestionLogRecord | undefined> {
    const row = this.findStatement.get(id) as unknown as StoredQuestionLogRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  async list(query: QuestionLogListQuery): Promise<QuestionLogPage> {
    const rows = this.listStatement.all(query.limit, query.offset) as unknown as StoredQuestionLogRow[];
    const count = this.totalStatement.get() as unknown as { total: number };
    return {
      items: rows.map(toSummary),
      limit: query.limit,
      offset: query.offset,
      total: count.total,
    };
  }

  close(): void {
    this.database.close();
  }
}

function toRecord(row: StoredQuestionLogRow): QuestionLogRecord {
  return {
    ...toSummary(row),
    answer: row.answer,
    apology: row.apology,
    evidenceReferences: parseEvidenceReferences(row.evidence_references),
  };
}

function toSummary(row: StoredQuestionLogRow): QuestionLogSummary {
  return {
    answerLanguage: row.answer_language,
    channel: row.channel as QuestionLogChannel,
    completedAt: row.completed_at,
    grounded: row.grounded === null ? null : row.grounded === 1,
    id: row.id,
    latencyMs: row.latency_ms,
    model: row.model,
    provider: row.provider,
    question: row.question,
    startedAt: row.started_at,
    status: row.status as QuestionLogStatus,
    sufficiency: row.sufficiency as EvidenceSufficiency,
  };
}

function parseEvidenceReferences(value: string | undefined): string[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
}
