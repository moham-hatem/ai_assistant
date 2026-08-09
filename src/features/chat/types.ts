import type { AppLanguage } from '../../i18n/language';

export interface ChatTurn {
  role: 'assistant' | 'user';
  content: string;
}

export interface UserChatMessage extends ChatTurn {
  id: string;
  role: 'user';
}

export interface WelcomeChatMessage extends ChatTurn {
  id: string;
  kind: 'welcome';
  role: 'assistant';
}

export interface AnswerChatMessage extends ChatTurn {
  id: string;
  kind: 'answer';
  requestId: string;
  role: 'assistant';
}

export type ChatMessage = UserChatMessage | WelcomeChatMessage | AnswerChatMessage;

export type ChatStatus = 'idle' | 'answering';

export interface AnswerQuestionRequest {
  history: ChatTurn[];
  language: AppLanguage;
  question: string;
}

export interface AnswerQuestionResponse {
  answer: string;
  grounded: boolean;
  requestId: string;
}
