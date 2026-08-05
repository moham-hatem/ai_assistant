import { useEffect, useRef } from 'react';
import { Bot, Sparkles, UserRound } from 'lucide-react';
import type { ChatMessage } from '../types';

interface ChatTranscriptProps {
  messages: ChatMessage[];
  isAnswering: boolean;
  searchingLabel: string;
}

export function ChatTranscript({ messages, isAnswering, searchingLabel }: ChatTranscriptProps) {
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
        <article className={`message message-${message.role}`} key={message.id}>
          <span className="message-avatar" aria-hidden="true">
            {message.role === 'assistant' ? <Bot size={18} /> : <UserRound size={18} />}
          </span>
          <p>{message.content}</p>
        </article>
      ))}
      {isAnswering && (
        <article className="message message-assistant">
          <span className="message-avatar" aria-hidden="true"><Sparkles size={18} /></span>
          <p className="thinking">{searchingLabel}</p>
        </article>
      )}
    </div>
  );
}
