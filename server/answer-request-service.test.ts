import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuestionLogRecord } from '../shared/contracts/question-log.ts';
import { AnswerRequestService } from './answer-request-service.ts';
import type { AnswerExecution } from './answer-service.ts';
import type { AnswerInput } from './domain.ts';

const input: AnswerInput = {
  history: [],
  language: 'en',
  question: 'What is the lesson?',
};

test('records answered requests with execution metadata and the typed channel', async () => {
  const records: QuestionLogRecord[] = [];
  const service = requestService({
    evidenceReferences: ['lesson:7'],
    result: {
      answer: 'A grounded answer.',
      generation: { model: 'test-model', provider: 'test-provider' },
      grounded: true,
    },
  }, records);

  const result = await service.answer(input, 'telegram');

  assert.deepEqual(result, {
    answer: 'A grounded answer.',
    grounded: true,
    requestId: records[0]?.id,
  });
  assert.deepEqual(records[0]?.evidenceReferences, ['lesson:7']);
  assert.equal(records[0]?.channel, 'telegram');
  assert.equal(records[0]?.model, 'test-model');
  assert.equal(records[0]?.provider, 'test-provider');
  assert.equal(records[0]?.status, 'answered');
});

test('records ungrounded answers as declined', async () => {
  const records: QuestionLogRecord[] = [];
  const service = requestService({
    evidenceReferences: ['lesson:8'],
    result: { answer: 'Not enough evidence.', grounded: false },
  }, records);

  const result = await service.answer(input, 'web');

  assert.equal(result.grounded, false);
  assert.equal(records[0]?.answer, null);
  assert.equal(records[0]?.apology, 'Not enough evidence.');
  assert.deepEqual(records[0]?.evidenceReferences, ['lesson:8']);
  assert.equal(records[0]?.status, 'declined');
  assert.equal(records[0]?.sufficiency, 'insufficient');
});

test('records failed requests and rethrows the original AnswerService error', async () => {
  const failure = new Error('model unavailable');
  let recorded: QuestionLogRecord | undefined;
  const service = new AnswerRequestService({
    answerWithContext: async () => { throw failure; },
  }, {
    record: async (record) => {
      recorded = record;
      return true;
    },
  });

  await assert.rejects(service.answer(input, 'telegram'), (error) => error === failure);
  assert.equal(recorded?.channel, 'telegram');
  assert.deepEqual(recorded?.evidenceReferences, []);
  assert.equal(recorded?.model, null);
  assert.equal(recorded?.provider, null);
  assert.equal(recorded?.status, 'failed');
  assert.equal(service.requestIdFor(failure), recorded?.id);
});

test('audit failure is fail-open for successful answers', async () => {
  const service = new AnswerRequestService(answerExecutor({
    evidenceReferences: [],
    result: { answer: 'Answer survives audit failure.', grounded: true },
  }), {
    record: async () => { throw new Error('audit unavailable'); },
  });

  const result = await service.answer(input, 'web');
  assert.equal(result.answer, 'Answer survives audit failure.');
});

test('audit failure does not replace the original AnswerService error', async () => {
  const failure = new Error('original failure');
  const service = new AnswerRequestService({
    answerWithContext: async () => { throw failure; },
  }, {
    record: async () => { throw new Error('audit failure'); },
  });

  await assert.rejects(service.answer(input, 'web'), (error) => error === failure);
});

test('does not return success until the audit attempt settles', async () => {
  let releaseAudit!: () => void;
  let auditStarted!: () => void;
  const started = new Promise<void>((resolve) => { auditStarted = resolve; });
  const auditGate = new Promise<void>((resolve) => { releaseAudit = resolve; });
  const service = new AnswerRequestService(answerExecutor({
    evidenceReferences: [],
    result: { answer: 'Persisted first.', grounded: true },
  }), {
    record: async () => {
      auditStarted();
      await auditGate;
      return true;
    },
  });
  let settled = false;
  const pending = service.answer(input, 'web').finally(() => { settled = true; });

  await started;
  await Promise.resolve();
  assert.equal(settled, false);
  releaseAudit();
  assert.equal((await pending).answer, 'Persisted first.');
});

function requestService(execution: AnswerExecution, records: QuestionLogRecord[]) {
  return new AnswerRequestService(answerExecutor(execution), {
    record: async (record) => {
      records.push(record);
      return true;
    },
  });
}

function answerExecutor(execution: AnswerExecution) {
  return { answerWithContext: async () => execution };
}
