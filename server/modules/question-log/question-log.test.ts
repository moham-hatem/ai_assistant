import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { AnswerService } from '../../answer-service.ts';
import { createAnswerHandler } from '../../http/answer-handler.ts';
import { createQuestionLogHandler } from './question-log-handler.ts';
import type { QuestionLogRepository } from './question-log-repository.ts';
import { QuestionLogService } from './question-log-service.ts';
import { SqliteQuestionLogRepository } from './sqlite-question-log-repository.ts';

test('SQLite repository persists details and provides ordered pagination', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'question-log-repository-test-'));
  const path = join(directory, 'question-log.sqlite');
  const first = completedRecord({
    id: randomUUID(),
    question: 'First question',
    startedAt: '2026-08-06T08:00:00.000Z',
  });
  const second = completedRecord({
    answerLanguage: 'fr',
    channel: 'telegram',
    id: randomUUID(),
    question: 'Quelle est la leçon ?',
    startedAt: '2026-08-06T09:00:00.000Z',
  });
  let repository = new SqliteQuestionLogRepository(path);

  try {
    await repository.save(first);
    await repository.save(second);

    const page = await repository.list({ limit: 1, offset: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.items[0]?.id, first.id);
    assert.equal('answer' in page.items[0], false);

    repository.close();
    repository = new SqliteQuestionLogRepository(path);
    const stored = await repository.findById(second.id);
    assert.deepEqual(stored, second);
    assert.equal(stored?.answerLanguage, 'fr');
    assert.equal(stored?.channel, 'telegram');
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('question log service reports persistence failures without throwing', async () => {
  const failure = new Error('disk is read-only');
  let reported: unknown;
  const service = new QuestionLogService(failingRepository(failure), (error) => {
    reported = error;
  });

  assert.equal(await service.record(completedRecord()), false);
  assert.equal(reported, failure);
});

test('answer API records execution evidence and model metadata without logging history', async () => {
  const answerService = testAnswerService();
  let recorded: QuestionLogRecord | undefined;
  const handler = createAnswerHandler(answerService, {
    record: async (record) => {
      recorded = record;
      return true;
    },
  }, () => undefined);

  await withServer((request, response) => void handler(request, response), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/answer-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is the lesson?',
        language: 'en',
        history: [{ role: 'user', content: 'private prior turn' }],
      }),
    });
    assert.equal(response.status, 200);
  });

  assert.ok(recorded);
  assert.equal(recorded.status, 'answered');
  assert.equal(recorded.answer, 'A grounded answer.');
  assert.deepEqual(recorded.evidenceReferences, ['lesson:7']);
  assert.equal(recorded.provider, 'test-provider');
  assert.equal(recorded.model, 'test-model');
  assert.equal(recorded.sufficiency, 'sufficient');
  assert.equal(JSON.stringify(recorded).includes('private prior turn'), false);
});

test('answer API returns the answer even when the audit writer throws', async () => {
  const answerService = testAnswerService();
  const handler = createAnswerHandler(answerService, {
    record: async () => {
      throw new Error('audit failed');
    },
  }, () => undefined);

  await withServer((request, response) => void handler(request, response), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/answer-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is the lesson?', language: 'en' }),
    });
    const body = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.answer, 'A grounded answer.');
    assert.equal(body.grounded, true);
    assert.equal('generation' in body, false);
    assert.equal('evidenceReferences' in body, false);
  });
});

test('read-only question log API validates pagination and returns list and detail views', async () => {
  const repository = new SqliteQuestionLogRepository(':memory:');
  const record = completedRecord();
  await repository.save(record);
  const handler = createQuestionLogHandler(repository, () => undefined);

  try {
    await withServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      void handler(request, response, url);
    }, async (baseUrl) => {
      const listResponse = await fetch(`${baseUrl}/api/internal/question-logs?limit=1&offset=0`);
      const list = await listResponse.json() as {
        items: Array<Record<string, unknown>>;
        total: number;
      };
      assert.equal(listResponse.status, 200);
      assert.equal(list.total, 1);
      assert.equal(list.items[0]?.id, record.id);
      assert.equal('answer' in list.items[0], false);

      const detailResponse = await fetch(`${baseUrl}/api/internal/question-logs/${record.id}`);
      const detail = await detailResponse.json() as { record: QuestionLogRecord };
      assert.equal(detailResponse.status, 200);
      assert.deepEqual(detail.record, record);

      const invalidResponse = await fetch(`${baseUrl}/api/internal/question-logs?limit=0`);
      assert.equal(invalidResponse.status, 400);

      const writeResponse = await fetch(`${baseUrl}/api/internal/question-logs`, {
        method: 'POST',
      });
      assert.equal(writeResponse.status, 405);
    });
  } finally {
    repository.close();
  }
});

function completedRecord(overrides: Partial<QuestionLogRecord> = {}): QuestionLogRecord {
  return {
    answer: 'A grounded answer.',
    answerLanguage: 'en',
    apology: null,
    channel: 'web',
    completedAt: '2026-08-06T08:00:00.025Z',
    evidenceReferences: ['lesson:7', 'lesson:8'],
    grounded: true,
    id: randomUUID(),
    latencyMs: 25,
    model: 'test-model',
    provider: 'test-provider',
    question: 'What is the lesson?',
    startedAt: '2026-08-06T08:00:00.000Z',
    status: 'answered',
    sufficiency: 'sufficient',
    ...overrides,
  };
}

function failingRepository(error: Error): QuestionLogRepository {
  return {
    findById: async () => undefined,
    list: async () => ({ items: [], limit: 1, offset: 0, total: 0 }),
    save: async () => {
      throw error;
    },
  };
}

function testAnswerService(): AnswerService {
  return new AnswerService({
    search: async () => ({
      evidence: [{ id: 'lesson:7', content: 'Trusted local evidence for the answer.' }],
      fileCount: 1,
    }),
  }, 6, {
    answer: async () => ({
      answer: 'A grounded answer.',
      generation: { provider: 'test-provider', model: 'test-model' },
      grounded: true,
    }),
  });
}

async function withServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a port.');

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
