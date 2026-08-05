import type { AnswerInput, AnswerLanguage, ChatTurn } from '../domain.ts';
import { AppError } from '../errors.ts';

const minimumQuestionLength = 3;
const maximumQuestionLength = 1_000;
const maximumTurnLength = 2_000;
const maximumHistoryLength = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseHistory(value: unknown): ChatTurn[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalidRequest();

  return value.slice(-maximumHistoryLength).map((turn) => {
    if (!isRecord(turn) || (turn.role !== 'assistant' && turn.role !== 'user')) invalidRequest();
    const content = typeof turn.content === 'string' ? turn.content.trim() : '';
    if (!content || content.length > maximumTurnLength) invalidRequest();
    return { role: turn.role, content };
  });
}

export function parseAnswerInput(value: unknown): AnswerInput {
  if (!isRecord(value)) invalidRequest();
  const question = typeof value.question === 'string' ? value.question.trim() : '';
  if (question.length < minimumQuestionLength || question.length > maximumQuestionLength) {
    throw new AppError(
      'INVALID_REQUEST',
      `يجب أن يكون السؤال بين ${minimumQuestionLength} و${maximumQuestionLength} حرفًا.`,
      400,
    );
  }

  return { question, history: parseHistory(value.history), language: parseLanguage(value.language) };
}

function parseLanguage(value: unknown): AnswerLanguage {
  if (value === undefined) return 'ar';
  if (value === 'ar' || value === 'en' || value === 'sw') return value;
  invalidRequest();
}

function invalidRequest(): never {
  throw new AppError('INVALID_REQUEST', 'صيغة الطلب غير صحيحة.', 400);
}
