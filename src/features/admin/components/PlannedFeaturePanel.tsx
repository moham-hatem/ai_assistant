import { CircleDashed } from 'lucide-react';
import type { AdminCopy } from '../adminCopy';

interface PlannedFeaturePanelProps {
  copy: AdminCopy;
  current: string;
  next: string;
  points: string[];
}

export function PlannedFeaturePanel({ copy, current, next, points }: PlannedFeaturePanelProps) {
  return (
    <section className="planned-feature-panel">
      <div className="planned-feature-status">
        <CircleDashed aria-hidden="true" size={24} />
        <div><span>{copy.status}</span><strong>{copy.planned}</strong></div>
      </div>
      <p>{current}</p>
      <ul>{points.map((point) => <li key={point}>{point}</li>)}</ul>
      <div className="planned-feature-next">
        <strong>{copy.nextStep}</strong>
        <p>{next}</p>
      </div>
    </section>
  );
}
