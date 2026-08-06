import type { ReactNode } from 'react';

interface QuestionLogStateProps {
  action?: ReactNode;
  body?: string;
  icon: ReactNode;
  title: string;
}

export function QuestionLogState({ action, body, icon, title }: QuestionLogStateProps) {
  return (
    <div className="question-log-state" role="status">
      <span className="question-log-state-icon">{icon}</span>
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
