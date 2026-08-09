import type { ReactNode } from 'react';

interface ReviewStateProps {
  action?: ReactNode;
  body?: string;
  icon: ReactNode;
  title: string;
}
export function ReviewState({ action, body, icon, title }: ReviewStateProps) {
  return (
    <div className="review-state" role="status">
      <span className="review-state-icon">{icon}</span>
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}
