import { LockKeyhole } from 'lucide-react';
import type { QualityMetricsCopy } from '../copy';

export function QualityDefinitions({ copy }: { copy: QualityMetricsCopy }) {
  return <section className="quality-definitions">
    <div className="quality-privacy"><LockKeyhole aria-hidden="true" size={19} /><p>{copy.privacy}</p></div>
    <h2>{copy.definitionsTitle}</h2>
    <dl>{copy.definitions.map((definition) => <div key={definition.title}>
      <dt>{definition.title}</dt><dd>{definition.body}</dd>
    </div>)}</dl>
  </section>;
}
