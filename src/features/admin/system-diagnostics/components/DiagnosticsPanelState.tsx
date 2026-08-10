import { AlertTriangle, LoaderCircle } from 'lucide-react';
import type { SystemDiagnosticsCopy } from '../copy';

export function DiagnosticsPanelState({ copy, kind, onRetry }: {
  copy: SystemDiagnosticsCopy;
  kind: 'error' | 'loading';
  onRetry?: () => void;
}) {
  const Icon = kind === 'loading' ? LoaderCircle : AlertTriangle;
  return <section className={`system-diagnostics-panel-state diagnostics-${kind}`} aria-live="polite">
    <Icon aria-hidden="true" className={kind === 'loading' ? 'system-diagnostics-spin' : undefined} />
    <div>
      {kind === 'error' && <h2>{copy.errorTitle}</h2>}
      <p>{kind === 'loading' ? copy.loading : copy.errorBody}</p>
    </div>
    {kind === 'error' && <button type="button" onClick={onRetry}>{copy.refresh}</button>}
  </section>;
}
