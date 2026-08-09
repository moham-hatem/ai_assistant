import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import test from 'node:test';
import { AnswerRequestService } from '../../answer-request-service.ts';
import { AnswerService } from '../../answer-service.ts';
import { createAnswerHandler } from '../../http/answer-handler.ts';
import type { FeedbackRepository } from './feedback-repository.ts';
import { createFeedbackHandler } from './feedback-handler.ts';
import { FeedbackService } from './feedback-service.ts';
import { feedbackQuestion, withFeedbackFixture } from './feedback-test-fixtures.ts';

test('feedback API validates, replays idempotently, filters summaries, and returns detail', async () => {
  await withFeedbackFixture(async ({ feedback, questionLogs, service }) => {
    const question = feedbackQuestion();
    await questionLogs.save(question);
    const handler = createFeedbackHandler(service, () => undefined);
    await withServer(routeFeedback(handler), async (baseUrl) => {
      const invalid = await requestJson(`${baseUrl}/api/feedback`, 'POST', {
        questionLogId: question.id,
        rating: 'helpful',
        reasons: ['unclear'],
        submissionId: randomUUID(),
      });
      assert.equal(invalid.response.status, 400);

      const submissionId = randomUUID();
      const input = {
        comment: '  Potentially sensitive answer. ',
        questionLogId: question.id,
        rating: 'unhelpful',
        reasons: ['harmful_or_sensitive'],
        submissionId,
      };
      const created = await requestJson(`${baseUrl}/api/feedback`, 'POST', input);
      const replay = await requestJson(`${baseUrl}/api/feedback`, 'POST', input);
      assert.equal(created.response.status, 201);
      assert.equal(replay.response.status, 201);
      assert.deepEqual(replay.body.feedback, created.body.feedback);
      assert.deepEqual(replay.body.review, created.body.review);
      const id = (created.body.feedback as { id: string }).id;

      const list = await requestJson(
        `${baseUrl}/api/internal/feedback?rating=unhelpful&reason=harmful_or_sensitive`
        + '&language=en&channel=web&reviewStatus=pending&limit=1&offset=0',
      );
      assert.equal(list.response.status, 200);
      assert.equal(list.body.total, 1);
      const summary = (list.body.items as Array<Record<string, unknown>>)[0]!;
      assert.equal(summary.hasComment, true);
      assert.equal('comment' in summary, false);

      const detail = await requestJson(`${baseUrl}/api/internal/feedback/${id}`);
      assert.equal(detail.response.status, 200);
      assert.equal((detail.body.feedback as { comment: string }).comment, 'Potentially sensitive answer.');
      assert.equal((detail.body.review as { status: string }).status, 'pending');
      assert.equal((await feedback.findDetail(id))?.feedback.questionLogId, question.id);

      assert.equal((await requestJson(`${baseUrl}/api/internal/feedback?unknown=1`)).response.status, 400);
      assert.equal((await requestJson(`${baseUrl}/api/internal/feedback/not-a-uuid`)).response.status, 400);
    });
  });
});

test('feedback persistence failure is an API error without leaked internals', async () => {
  const secret = 'private comment and stack detail';
  const repository: FeedbackRepository = {
    findDetail: async () => undefined,
    list: async (query) => ({ items: [], ...query, total: 0 }),
    submit: async () => { throw new Error(secret); },
  };
  const handler = createFeedbackHandler(new FeedbackService(repository), () => undefined);
  await withServer(routeFeedback(handler), async (baseUrl) => {
    const result = await requestJson(`${baseUrl}/api/feedback`, 'POST', {
      questionLogId: randomUUID(),
      rating: 'helpful',
      reasons: [],
      submissionId: randomUUID(),
    });
    assert.equal(result.response.status, 502);
    assert.equal(result.body.code, 'SERVICE_UNAVAILABLE');
    assert.equal(JSON.stringify(result.body).includes(secret), false);
    assert.equal(JSON.stringify(result.body).includes('stack'), false);
  });
});

test('answer response exposes requestId only after its question log accepts immediate feedback', async () => {
  await withFeedbackFixture(async ({ questionLogs, service }) => {
    const feedbackHandler = createFeedbackHandler(service, () => undefined);
    const answerHandler = createAnswerHandler(new AnswerRequestService(answerService(), {
      record: async (record) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        await questionLogs.save(record);
        return true;
      },
    }), () => undefined);

    await withServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/api/answer-question') void answerHandler(request, response);
      else void feedbackHandler(request, response, url);
    }, async (baseUrl) => {
      const answer = await requestJson(`${baseUrl}/api/answer-question`, 'POST', {
        language: 'en',
        question: 'What does the trusted lesson establish?',
      });
      assert.equal(answer.response.status, 200);
      const feedback = await requestJson(`${baseUrl}/api/feedback`, 'POST', {
        questionLogId: answer.body.requestId,
        rating: 'helpful',
        reasons: [],
        submissionId: randomUUID(),
      });
      assert.equal(feedback.response.status, 201);
      assert.equal((feedback.body.feedback as { questionLogId: string }).questionLogId, answer.body.requestId);
    });
  });
});

function answerService(): AnswerService {
  return new AnswerService({
    search: async () => ({
      evidence: [{ content: 'Trusted local evidence.', id: 'lesson:1' }],
      fileCount: 1,
    }),
  }, 6, {
    answer: async () => ({ answer: 'A grounded answer.', grounded: true }),
  });
}

function routeFeedback(handler: ReturnType<typeof createFeedbackHandler>) {
  return (request: IncomingMessage, response: ServerResponse) => {
    void handler(request, response, new URL(request.url ?? '/', 'http://localhost'));
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
