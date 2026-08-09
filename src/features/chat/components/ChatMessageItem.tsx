import { Bot, UserRound } from 'lucide-react';
import type { AppTranslations } from '../../../i18n/translations';
import type { ChatMessage } from '../types';
import { MessageFeedback } from '../feedback/components/MessageFeedback';

interface ChatMessageItemProps {
  copy: AppTranslations;
  message: ChatMessage;
}

export function ChatMessageItem({ copy, message }: ChatMessageItemProps) {
  return (
    <article className={`message message-${message.role}`}>
      <span className="message-avatar" aria-hidden="true">
        {message.role === 'assistant' ? <Bot size={18} /> : <UserRound size={18} />}
      </span>
      <div className="message-body">
        <p className="message-content" dir="auto">{message.content}</p>
        {message.role === 'assistant' && message.kind === 'answer' && (
          <MessageFeedback copy={copy.feedback} questionLogId={message.requestId} />
        )}
      </div>
    </article>
  );
}
