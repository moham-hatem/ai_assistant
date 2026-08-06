import { AlertTriangle, BookOpen, LoaderCircle } from 'lucide-react';

interface BooksPanelStateProps {
  actionLabel?: string;
  body?: string;
  loading?: boolean;
  onAction?: () => void;
  title: string;
  tone?: 'empty' | 'error';
}

export function BooksPanelState({ actionLabel, body, loading, onAction, title, tone = 'empty' }: BooksPanelStateProps) {
  const Icon = loading ? LoaderCircle : tone === 'error' ? AlertTriangle : BookOpen;
  return (
    <div className="books-panel-state" role={loading ? 'status' : undefined}>
      <Icon className={loading ? 'is-spinning' : undefined} size={26} />
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {actionLabel && onAction && (
        <button className="books-secondary-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
