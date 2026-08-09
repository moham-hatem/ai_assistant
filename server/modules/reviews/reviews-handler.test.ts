import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AuthPrincipal } from '../../../shared/contracts/auth.ts';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { ReviewService } from './review-service.ts';
import { createReviewsHandler } from './reviews-handler.ts';
import { SqliteReviewRepository } from './sqlite-review-repository.ts';

test('internal review API validates, creates, claims, decides, lists, and returns details', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reviews-handler-test-'));
  const path = join(directory, 'question-log.sqlite');
  const questionLogs = new SqliteQuestionLogRepository(path);
  const reviews = new SqliteReviewRepository(path);
  const service = new ReviewService(reviews, questionLogs);
  const questionLog = record();
  await questionLogs.save(questionLog);
  const handler = createReviewsHandler(service, () => undefined);

  try {
    await withServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      void handler(request, response, url, principal);
    }, async (baseUrl) => {
      const invalid = await requestJson(`${baseUrl}/api/internal/reviews`, 'POST', {
        questionLogId: questionLog.id,
        unexpected: true,
      });
      assert.equal(invalid.response.status, 400);
      assert.equal(invalid.body.code, 'INVALID_REQUEST');

      const created = await requestJson(`${baseUrl}/api/internal/reviews`, 'POST', {
        questionLogId: questionLog.id,
      });
      assert.equal(created.response.status, 201);
      assert.equal(typeof created.body.requestId, 'string');
      const review = created.body.review as { id: string; status: string };
      assert.equal(review.status, 'pending');

      const duplicate = await requestJson(`${baseUrl}/api/internal/reviews`, 'POST', {
        questionLogId: questionLog.id,
      });
      assert.equal(duplicate.response.status, 409);
      assert.equal(duplicate.body.code, 'DUPLICATE_REVIEW');

      const claimed = await requestJson(
        `${baseUrl}/api/internal/reviews/${review.id}/status`,
        'POST',
        { reviewerId: 'forged-reviewer', status: 'in_review' },
      );
      assert.equal(claimed.response.status, 200);
      assert.equal(
        (claimed.body.review as { assignedReviewerId: string }).assignedReviewerId,
        principal.id,
      );

      const invalidDecision = await requestJson(
        `${baseUrl}/api/internal/reviews/${review.id}/decision`,
        'POST',
        {
          correctedAnswer: 'Correction is not valid for a content change request.',
          outcome: 'needs_changes',
          reviewerId: 'forged-reviewer',
        },
      );
      assert.equal(invalidDecision.response.status, 400);
      assert.equal(invalidDecision.body.code, 'INVALID_REQUEST');

      const decided = await requestJson(
        `${baseUrl}/api/internal/reviews/${review.id}/decision`,
        'POST',
        {
          correctedAnswer: 'Corrected answer from the teacher.',
          internalNotes: 'Clarify the source scope.',
          outcome: 'approved',
          reviewerId: 'forged-reviewer',
        },
      );
      assert.equal(decided.response.status, 200);
      const detail = decided.body.review as {
        decision: { correctedAnswer: string; reviewerId: string };
        events: Array<{ decisionId: string | null; reviewerId: string | null; type: string }>;
        item: { status: string };
        questionLog: { answer: string };
      };
      assert.equal(detail.item.status, 'approved');
      assert.equal(detail.decision.correctedAnswer, 'Corrected answer from the teacher.');
      assert.equal(detail.decision.reviewerId, principal.id);
      assert.equal(detail.questionLog.answer, questionLog.answer);
      assert.deepEqual(detail.events.map((event) => event.type), [
        'created',
        'claimed',
        'decision_saved',
      ]);
      assert.ok(detail.events.at(-1)?.decisionId);
      assert.deepEqual(detail.events.slice(1).map((event) => event.reviewerId), [
        principal.id,
        principal.id,
      ]);

      const list = await requestJson(
        `${baseUrl}/api/internal/reviews?status=approved&channel=web&limit=1&offset=0`,
      );
      assert.equal(list.response.status, 200);
      assert.equal(list.body.total, 1);
      const entries = list.body.items as Array<{ item: unknown; questionLog: Record<string, unknown> }>;
      assert.equal('answer' in entries[0]!.questionLog, false);

      const fetched = await requestJson(`${baseUrl}/api/internal/reviews/${review.id}`);
      assert.equal(fetched.response.status, 200);
      assert.equal(
        ((fetched.body.review as { decision: { outcome: string } }).decision.outcome),
        'approved',
      );

      const invalidFilter = await requestJson(`${baseUrl}/api/internal/reviews?unknown=value`);
      assert.equal(invalidFilter.response.status, 400);
      const invalidId = await requestJson(`${baseUrl}/api/internal/reviews/not-a-uuid`);
      assert.equal(invalidId.response.status, 400);
    });
  } finally {
    reviews.close();
    questionLogs.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const principal: AuthPrincipal = {
  displayName: 'Teacher API',
  email: 'teacher-api@example.test',
  id: 'teacher-api',
  permissions: ['content:review'],
  roles: ['reviewer'],
};

function record(): QuestionLogRecord {
  return {
    answer: 'Original grounded answer.',
    answerLanguage: 'en-US',
    apology: null,
    channel: 'web',
    completedAt: '2026-08-06T09:00:00.020Z',
    evidenceReferences: ['test:chunk'],
    grounded: true,
    id: randomUUID(),
    latencyMs: 20,
    model: 'test-model',
    provider: 'test-provider',
    question: 'What does the source establish?',
    startedAt: '2026-08-06T09:00:00.000Z',
    status: 'answered',
    sufficiency: 'sufficient',
  };
}

async function requestJson(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method,
  });
  return { body: await response.json() as Record<string, unknown>, response };
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
  if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
