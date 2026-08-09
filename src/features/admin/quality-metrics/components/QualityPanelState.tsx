import { AlertTriangle, BarChart3 } from 'lucide-react';
import type { QualityMetricsCopy } from '../copy';

export function QualityPanelState({ copy, kind, onRetry }: {
  copy: QualityMetricsCopy;
  kind: 'empty' | 'error' | 'loading';
  onRetry?: () => void;
}) {
  return <section className={`quality-panel-state quality-panel-${kind}`} aria-live="polite">
    {kind === 'error' ? <AlertTriangle aria-hidden="true" /> : <BarChart3 aria-hidden="true" />}
    <p>{kind === 'loading' ? copy.loading : kind === 'error' ? copy.error : copy.empty}</p>
    {kind === 'error' && <button type="button" onClick={onRetry}>{copy.retry}</button>}
  </section>;
}
