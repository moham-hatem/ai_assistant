import type { ReviewDetail, ReviewItem, ReviewPage } from '../../shared/contracts/reviews.ts';
import type { QuestionLogRecord, QuestionLogSummary } from '../../shared/contracts/question-log.ts';

export const reviewItem: ReviewItem = {
  assignedReviewerId: null,
  claimedAt: null,
  createdAt: '2026-08-08T08:00:00.000Z',
  decidedAt: null,
  id: '54fbbf44-f68e-4b20-b432-0b19d34c47bd',
  questionLogId: 'b6f245b1-415e-46f8-b90f-01246249bfcc',
  status: 'pending',
  updatedAt: '2026-08-08T08:00:00.000Z',
};
export const questionSummary: QuestionLogSummary = {
  answerLanguage: 'en-US',
  channel: 'future-channel',
  completedAt: '2026-08-08T07:59:00.025Z',
  grounded: true,
  id: reviewItem.questionLogId,
  latencyMs: 25,
  model: 'qa-model',
  provider: 'qa-provider',
  question: 'What does the test source establish?',
  startedAt: '2026-08-08T07:59:00.000Z',
  status: 'answered',
  sufficiency: 'sufficient',
};

export const questionRecord: QuestionLogRecord = {
  ...questionSummary,
  answer: 'It establishes a deterministic QA statement.',
  apology: null,
  evidenceReferences: ['qa-book:edition-1:chunk-7'],
};

export const reviewDetail: ReviewDetail = {
  decision: null,
  events: [
    {
      createdAt: '2026-08-08T08:00:00.000Z',
      decisionId: null,
      fromStatus: null,
      id: '129f5f90-6c68-4b15-a212-296493f7748a',
      reviewItemId: reviewItem.id,
      reviewerId: null,
      toStatus: 'pending',
      type: 'created',
    },
  ],
  item: reviewItem,
  questionLog: questionRecord,
};

export const reviewPage: ReviewPage = {
  items: [{ item: reviewItem, questionLog: questionSummary }],
  limit: 10,
  offset: 0,
  total: 1,
};
