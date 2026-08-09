import { useEffect, useRef, useState } from 'react';
import { answerQuestion, ChatServiceError } from '../api/answerQuestion';
import { createAnswerMessage, createWelcomeMessage, getChatHistory } from '../chat-messages';
import type { ChatMessage, ChatStatus } from '../types';
import type { AppLanguage } from '../../../i18n/language';
import type { AppTranslations } from '../../../i18n/translations';

export function useLearningChat(language: AppLanguage, copy: AppTranslations) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createWelcomeMessage(copy.welcome)]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generationRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    generationRef.current += 1;
    sendingRef.current = false;
    setMessages([createWelcomeMessage(copy.welcome)]);
    setErrorMessage(null);
    setStatus('idle');
  }, [copy.welcome, language]);

  async function sendQuestion(question: string) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const generation = generationRef.current;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setErrorMessage(null);
    setStatus('answering');

    try {
      const response = await answerQuestion(
        { question, history: getChatHistory(messages), language },
        copy,
      );
      if (generation !== generationRef.current) return;
      setMessages((currentMessages) => [...currentMessages, createAnswerMessage(response)]);
    } catch (error) {
      if (generation !== generationRef.current) return;
      setErrorMessage(
        error instanceof ChatServiceError
          ? error.message
          : copy.unexpectedError,
      );
    } finally {
      if (generation === generationRef.current) {
        sendingRef.current = false;
        setStatus('idle');
      }
    }
  }

  return { errorMessage, messages, sendQuestion, status };
}
