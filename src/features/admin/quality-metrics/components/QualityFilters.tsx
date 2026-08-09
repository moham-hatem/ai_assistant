import type { Dispatch } from 'react';
import type { QualityMetricsAction, QualityMetricsState } from '../quality-metrics-state';
import type { QualityMetricsCopy } from '../copy';

interface QualityFiltersProps {
  copy: QualityMetricsCopy;
  dispatch: Dispatch<QualityMetricsAction>;
  state: QualityMetricsState;
}

export function QualityFilters({ copy, dispatch, state }: QualityFiltersProps) {
  const error = state.validationError === 'invalid-range'
    ? copy.invalidRange
    : state.validationError === 'invalid-time' ? copy.invalidTime : null;
  const update = (field: 'channel' | 'from' | 'language' | 'to') => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => dispatch({ field, type: 'draft-changed', value: event.target.value });

  return (
    <form className="quality-filters" onSubmit={(event) => {
      event.preventDefault();
      dispatch({ type: 'apply' });
    }}>
      <div className="quality-filter-heading">
        <strong>{copy.filters.title}</strong>
        <span>{copy.filters.utc}</span>
      </div>
      <label>{copy.filters.from}<input type="datetime-local" value={state.draft.from} onChange={update('from')} /></label>
      <label>{copy.filters.to}<input type="datetime-local" value={state.draft.to} onChange={update('to')} /></label>
      <label>{copy.filters.language}<select value={state.draft.language} onChange={update('language')}>
        <option value="">{copy.filters.all}</option><option value="ar">العربية</option>
        <option value="en">English</option><option value="sw">Kiswahili</option>
      </select></label>
      <label>{copy.filters.channel}<select value={state.draft.channel} onChange={update('channel')}>
        <option value="">{copy.filters.all}</option><option value="web">Web</option>
        <option value="telegram">Telegram</option>
      </select></label>
      <button type="submit">{copy.apply}</button>
      {error && <p className="quality-filter-error" role="alert">{error}</p>}
    </form>
  );
}
