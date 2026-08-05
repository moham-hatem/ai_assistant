import { useEffect, useState } from 'react';
import { answerQuestion, ChatServiceError } from '../api/answerQuestion';
import type { ChatMessage, ChatStatus, ChatTurn } from '../types';
import type { AppLanguage } from '../../../i18n/language';
import type { AppTranslations } from '../../../i18n/translations';

export function useLearningChat(language: AppLanguage, copy: AppTranslations) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcomeMessage(copy.welcome)]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessages([welcomeMessage(copy.welcome)]);
    setErrorMessage(null);
    setStatus('idle');
  }, [copy.welcome, language]);

  async function sendQuestion(question: string) {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setErrorMessage(null);
    setStatus('answering');

    try {
      const response = await answerQuestion(
        { question, history: getHistory(messages), language },
        copy,
      );
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: response.requestId,
          role: 'assistant',
          content: response.answer,
        },
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof ChatServiceError
          ? error.message
          : copy.unexpectedError,
      );
    } finally {
      setStatus('idle');
    }
  }

  return { errorMessage, messages, sendQuestion, status };
}

function welcomeMessage(content: string): ChatMessage {
  return { id: 'welcome', role: 'assistant', content };
}

function getHistory(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((message) => message.id !== 'welcome')
    .slice(-8)
    .map(({ role, content }) => ({ role, content }));
}
