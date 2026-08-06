import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QuestionLogsApiError,
  parseQuestionLogDetail,
  parseQuestionLogPage,
  parseQuestionLogRecord,
} from '../../src/features/admin/question-logs/api/question-log-parser.ts';
import {
  nextOffset,
  previousOffset,
  visibleRange,
} from '../../src/features/admin/question-logs/pagination.ts';

const summary = {
  answerLanguage: 'ar',
  channel: 'web',
  completedAt: '2026-08-06T08:00:00.025Z',
  grounded: true,
  id: 'b6f245b1-415e-46f8-b90f-01246249bfcc',
  latencyMs: 25,
  model: 'test-model',
  provider: 'test-provider',
  question: 'ما الدرس؟',
  startedAt: '2026-08-06T08:00:00.000Z',
  status: 'answered',
  sufficiency: 'sufficient',
};

test('question log parsers accept the list and detail contracts', () => {
  const page = parseQuestionLogPage({
    items: [summary],
    limit: 10,
    offset: 0,
    requestId: 'ignored-response-metadata',
    total: 1,
  });
  assert.deepEqual(page.items, [summary]);
  assert.equal(page.total, 1);

  const record = parseQuestionLogDetail({
    record: {
      ...summary,
      answer: 'إجابة موثقة.',
      apology: null,
      evidenceReferences: ['lesson:7'],
    },
  });
  assert.equal(record.answer, 'إجابة موثقة.');
  assert.deepEqual(record.evidenceReferences, ['lesson:7']);
});

test('question log parsers reject malformed server data', () => {
  assert.throws(
    () => parseQuestionLogPage({ items: [{ ...summary, status: 'pending' }], limit: 10, offset: 0, total: 1 }),
    QuestionLogsApiError,
  );
  assert.throws(
    () => parseQuestionLogRecord({ ...summary, answer: null, apology: 'No evidence', evidenceReferences: [7] }),
    QuestionLogsApiError,
  );
  assert.throws(
    () => parseQuestionLogRecord({ ...summary, answer: null, apology: 'No evidence', evidenceReferences: [] }),
    QuestionLogsApiError,
  );
  assert.throws(
    () => parseQuestionLogPage({ items: [], limit: 10, offset: -1, total: 0 }),
    QuestionLogsApiError,
  );
  assert.throws(() => parseQuestionLogDetail({ record: null }), QuestionLogsApiError);
});

test('pagination helpers keep navigation within valid page boundaries', () => {
  assert.equal(nextOffset(0, 10, 27), 10);
  assert.equal(nextOffset(20, 10, 27), 20);
  assert.equal(previousOffset(20, 10), 10);
  assert.equal(previousOffset(0, 10), 0);
  assert.deepEqual(visibleRange(10, 4), { start: 11, end: 14 });
  assert.deepEqual(visibleRange(0, 0), { start: 0, end: 0 });
});
