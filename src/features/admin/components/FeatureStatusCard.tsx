import type { ReactNode } from 'react';

interface FeatureStatusCardProps {
  description: string;
  href?: string;
  icon: ReactNode;
  nextLabel: string;
  nextStep: string;
  status: string;
  statusKind: 'ready' | 'planned';
  title: string;
}

export function FeatureStatusCard({
  description,
  href,
  icon,
  nextLabel,
  nextStep,
  status,
  statusKind,
  title,
}: FeatureStatusCardProps) {
  const content = (
    <>
      <div className="feature-card-heading">
        <span className="feature-card-icon">{icon}</span>
        <span className={`status-badge status-${statusKind}`}>{status}</span>
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="feature-next"><strong>{nextLabel}:</strong> {nextStep}</p>
    </>
  );

  return href
    ? <a className="feature-status-card feature-status-link" href={href}>{content}</a>
    : <article className="feature-status-card">{content}</article>;
}
