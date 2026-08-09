import {
  reviewDecisionOutcomes,
  reviewEventTypes,
  reviewStatuses,
  type ReviewDecision,
  type ReviewDetail,
  type ReviewEvent,
  type ReviewItem,
  type ReviewPage,
  type ReviewQueueEntry,
} from '../../../../../shared/contracts/reviews.ts';
import type { QuestionLogRecord, QuestionLogSummary } from '../../../../../shared/contracts/question-log';
import {
  asObject,
  invalid,
  readDate,
  readEnum,
  readInteger,
  readNullableBoolean,
  readNullableNonEmptyString,
  readNullableString,
  readString,
} from './review-parser-primitives.ts';

const logStatuses = ['answered', 'declined', 'failed'] as const;
const sufficiencies = ['sufficient', 'insufficient', 'unknown'] as const;

export function parseReviewPage(value: unknown): ReviewPage {
  const payload = asObject(value, 'list response');
  if (!Array.isArray(payload.items)) invalid('items');
  return {
    items: payload.items.map(parseQueueEntry),
    limit: readInteger(payload.limit, 'limit'),
    offset: readInteger(payload.offset, 'offset'),
    total: readInteger(payload.total, 'total'),
  };
}

export function parseReviewDetailResponse(value: unknown): ReviewDetail {
  return parseReviewDetail(asObject(value, 'detail response').review);
}

export function parseReviewItemResponse(value: unknown): ReviewItem {
  return parseReviewItem(asObject(value, 'status response').review);
}

export function parseReviewDetail(value: unknown): ReviewDetail {
  const payload = asObject(value, 'review detail');
  if (!Array.isArray(payload.events)) invalid('events');
  const detail: ReviewDetail = {
    decision: payload.decision === null ? null : parseDecision(payload.decision),
    events: payload.events.map(parseEvent),
    item: parseReviewItem(payload.item),
    questionLog: parseQuestionLogRecord(payload.questionLog),
  };
  const hasMismatchedRelationship = detail.item.questionLogId !== detail.questionLog.id
    || (detail.decision !== null && detail.decision.reviewItemId !== detail.item.id)
    || detail.events.some((event) => event.reviewItemId !== detail.item.id);
  if (hasMismatchedRelationship) invalid('review relationships');
  return detail;
}

export function parseReviewItem(value: unknown): ReviewItem {
  const payload = asObject(value, 'review item');
  return {
    assignedReviewerId: readNullableNonEmptyString(payload.assignedReviewerId, 'assignedReviewerId'),
    claimedAt: nullableDate(payload.claimedAt, 'claimedAt'),
    createdAt: readDate(payload.createdAt, 'createdAt'),
    decidedAt: nullableDate(payload.decidedAt, 'decidedAt'),
    id: readString(payload.id, 'id'),
    questionLogId: readString(payload.questionLogId, 'questionLogId'),
    status: readEnum(payload.status, reviewStatuses, 'review status'),
    updatedAt: readDate(payload.updatedAt, 'updatedAt'),
  };
}

function parseQueueEntry(value: unknown): ReviewQueueEntry {
  const payload = asObject(value, 'queue entry');
  const entry = { item: parseReviewItem(payload.item), questionLog: parseQuestionLogSummary(payload.questionLog) };
  if (entry.item.questionLogId !== entry.questionLog.id) invalid('queue relationship');
  return entry;
}

function parseDecision(value: unknown): ReviewDecision {
  const payload = asObject(value, 'decision');
  return {
    correctedAnswer: readNullableString(payload.correctedAnswer, 'correctedAnswer'),
    createdAt: readDate(payload.createdAt, 'decision createdAt'),
    id: readString(payload.id, 'decision id'),
    internalNotes: readNullableString(payload.internalNotes, 'internalNotes'),
    outcome: readEnum(payload.outcome, reviewDecisionOutcomes, 'decision outcome'),
    reviewItemId: readString(payload.reviewItemId, 'decision reviewItemId'),
    reviewerId: readString(payload.reviewerId, 'decision reviewerId'),
  };
}

function parseEvent(value: unknown): ReviewEvent {
  const payload = asObject(value, 'event');
  return {
    createdAt: readDate(payload.createdAt, 'event createdAt'),
    decisionId: readNullableNonEmptyString(payload.decisionId, 'event decisionId'),
    fromStatus: payload.fromStatus === null
      ? null
      : readEnum(payload.fromStatus, reviewStatuses, 'event fromStatus'),
    id: readString(payload.id, 'event id'),
    reviewItemId: readString(payload.reviewItemId, 'event reviewItemId'),
    reviewerId: readNullableNonEmptyString(payload.reviewerId, 'event reviewerId'),
    toStatus: readEnum(payload.toStatus, reviewStatuses, 'event toStatus'),
    type: readEnum(payload.type, reviewEventTypes, 'event type'),
  };
}

function parseQuestionLogRecord(value: unknown): QuestionLogRecord {
  const payload = asObject(value, 'question log');
  if (!Array.isArray(payload.evidenceReferences)) invalid('evidenceReferences');
  const evidenceReferences = payload.evidenceReferences.map(
    (item, index) => readString(item, `evidenceReferences[${index}]`),
  );
  const record: QuestionLogRecord = {
    ...parseQuestionLogSummary(payload),
    answer: readNullableString(payload.answer, 'answer'),
    apology: readNullableString(payload.apology, 'apology'),
    evidenceReferences,
  };
  const hasAnsweredShape = record.answer !== null && record.apology === null;
  const hasDeclinedShape = record.answer === null && record.apology !== null;
  if ((record.status === 'answered' && !hasAnsweredShape)
    || (record.status !== 'answered' && !hasDeclinedShape)) invalid('question log outcome');
  return record;
}

function parseQuestionLogSummary(value: unknown): QuestionLogSummary {
  const payload = asObject(value, 'question log summary');
  return {
    answerLanguage: readString(payload.answerLanguage, 'answerLanguage'),
    channel: readString(payload.channel, 'channel'),
    completedAt: readDate(payload.completedAt, 'completedAt'),
    grounded: readNullableBoolean(payload.grounded, 'grounded'),
    id: readString(payload.id, 'question log id'),
    latencyMs: readInteger(payload.latencyMs, 'latencyMs'),
    model: readNullableString(payload.model, 'model'),
    provider: readNullableString(payload.provider, 'provider'),
    question: readString(payload.question, 'question'),
    startedAt: readDate(payload.startedAt, 'startedAt'),
    status: readEnum(payload.status, logStatuses, 'question log status'),
    sufficiency: readEnum(payload.sufficiency, sufficiencies, 'sufficiency'),
  };
}

function nullableDate(value: unknown, field: string): string | null {
  return value === null ? null : readDate(value, field);
}
