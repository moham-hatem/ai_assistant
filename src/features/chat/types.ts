import type { AppLanguage } from '../../i18n/language';

export interface ChatTurn {
  role: 'assistant' | 'user';
  content: string;
}

export interface ChatMessage extends ChatTurn {
  id: string;
}

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
