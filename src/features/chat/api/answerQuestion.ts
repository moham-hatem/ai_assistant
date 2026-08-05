import type { AnswerQuestionRequest, AnswerQuestionResponse } from '../types';
import type { AppTranslations } from '../../../i18n/translations';

export class ChatServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export async function answerQuestion(
  input: AnswerQuestionRequest,
  messages: AppTranslations,
): Promise<AnswerQuestionResponse> {
  let response: Response;

  try {
    response = await fetch('/api/answer-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ChatServiceError(messages.serviceUnavailable);
  }

  const data = await readResponse(response, messages.incompleteResponse);
  if (!response.ok) {
    throw new ChatServiceError(input.language === 'ar' && data.message
      ? data.message
      : messages.answerUnavailable);
  }

  if (!data.answer || !data.requestId || typeof data.grounded !== 'boolean') {
    throw new ChatServiceError(messages.incompleteResponse);
  }

  return data as AnswerQuestionResponse;
}

async function readResponse(response: Response, incompleteResponse: string) {
  try {
    return await response.json() as Partial<AnswerQuestionResponse> & { message?: string };
  } catch {
    throw new ChatServiceError(incompleteResponse);
  }
}
