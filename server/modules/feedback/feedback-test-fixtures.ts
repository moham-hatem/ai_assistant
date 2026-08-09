import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QuestionLogRecord } from '../../../shared/contracts/question-log.ts';
import { SqliteQuestionLogRepository } from '../question-log/sqlite-question-log-repository.ts';
import { SqliteReviewRepository } from '../reviews/sqlite-review-repository.ts';
import { FeedbackService } from './feedback-service.ts';
import { SqliteFeedbackRepository } from './sqlite-feedback-repository.ts';

export interface FeedbackFixture {
  feedback: SqliteFeedbackRepository;
  path: string;
  questionLogs: SqliteQuestionLogRepository;
  reviews: SqliteReviewRepository;
  service: FeedbackService;
}

export async function withFeedbackFixture(
  run: (fixture: FeedbackFixture) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'feedback-test-'));
  const path = join(directory, 'question-log.sqlite');
  const questionLogs = new SqliteQuestionLogRepository(path);
  const reviews = new SqliteReviewRepository(path);
  const feedback = new SqliteFeedbackRepository(path);
  const service = new FeedbackService(feedback);
  try {
    await run({ feedback, path, questionLogs, reviews, service });
  } finally {
    feedback.close();
    reviews.close();
    questionLogs.close();
    await rm(directory, { recursive: true, force: true });
  }
}

export function feedbackQuestion(overrides: Partial<QuestionLogRecord> = {}): QuestionLogRecord {
  return {
    answer: 'A grounded answer.',
    answerLanguage: 'en',
    apology: null,
    channel: 'web',
    completedAt: '2026-08-09T12:00:00.025Z',
    evidenceReferences: ['test:chunk'],
    grounded: true,
    id: randomUUID(),
    latencyMs: 25,
    model: 'test-model',
    provider: 'test-provider',
    question: 'What does the lesson establish?',
    startedAt: '2026-08-09T12:00:00.000Z',
    status: 'answered',
    sufficiency: 'sufficient',
    ...overrides,
  };
}
