import type { AnswerQuestionResponse, AnswerChatMessage, ChatMessage, ChatTurn } from './types';

export function createAnswerMessage(
  response: AnswerQuestionResponse,
  id: string = crypto.randomUUID(),
): AnswerChatMessage {
  return {
    content: response.answer,
    id,
    kind: 'answer',
    requestId: response.requestId,
    role: 'assistant',
  };
}

export function createWelcomeMessage(content: string): ChatMessage {
  return { content, id: 'welcome', kind: 'welcome', role: 'assistant' };
}

export function getChatHistory(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((message) => message.role === 'user' || message.kind === 'answer')
    .slice(-8)
    .map(({ role, content }) => ({ role, content }));
}
