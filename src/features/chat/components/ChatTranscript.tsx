import { useEffect, useRef } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import type { ChatMessage } from '../types';
import type { AppTranslations } from '../../../i18n/translations';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatTranscriptProps {
  copy: AppTranslations;
  messages: ChatMessage[];
  isAnswering: boolean;
  searchingLabel: string;
}

export function ChatTranscript({ copy, messages, isAnswering, searchingLabel }: ChatTranscriptProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript && stickToBottomRef.current) {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
    }
  }, [isAnswering, messages]);

  function handleScroll() {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  return (
    <div
      className="transcript"
      aria-live="polite"
      aria-relevant="additions"
      onScroll={handleScroll}
      ref={transcriptRef}
      role="log"
      tabIndex={0}
    >
      {messages.map((message) => (
        <ChatMessageItem copy={copy} key={message.id} message={message} />
      ))}
      {isAnswering && (
        <article className="message message-assistant">
          <span className="message-avatar" aria-hidden="true"><Sparkles size={18} /></span>
          <p className="message-content thinking">{searchingLabel}</p>
        </article>
      )}
    </div>
  );
}
