import type { AppLanguage } from '../../../../i18n/language';
import { formatCount, formatDuration, formatPercent } from '../formatters';
import type { QualityMetricsCopy } from '../copy';
import type { QualityMetricsBreakdown } from '../types';

interface QualityBreakdownTableProps {
  copy: QualityMetricsCopy;
  language: AppLanguage;
  rows: QualityMetricsBreakdown[];
  title: string;
}

export function QualityBreakdownTable({ copy, language, rows, title }: QualityBreakdownTableProps) {
  return <section className="quality-breakdown">
    <h2>{title}</h2>
    {rows.length === 0 ? <p className="quality-breakdown-empty">{copy.breakdown.empty}</p> : (
      <div className="quality-table-scroll"><table><thead><tr>
        <th scope="col">{title}</th><th scope="col">{copy.breakdown.attempts}</th>
        <th scope="col">{copy.breakdown.satisfaction}</th><th scope="col">{copy.breakdown.coverage}</th>
        <th scope="col">{copy.breakdown.openReviews}</th><th scope="col">{copy.breakdown.medianClosure}</th>
        <th scope="col">{copy.breakdown.approved}</th>
      </tr></thead><tbody>{rows.map((row) => <tr key={row.key}>
        <th scope="row"><span lang={row.key}>{row.key}</span></th>
        <td>{formatCount(row.answerAttempts, language)}</td><td>{formatPercent(row.satisfactionRate, language)}</td>
        <td>{formatPercent(row.feedbackCoverageRate, language)}</td><td>{formatCount(row.openReviewCount, language)}</td>
        <td>{formatDuration(row.medianReviewClosureMs, language)}</td><td>{formatCount(row.approvedAnswerUsageCount, language)}</td>
      </tr>)}</tbody></table></div>
    )}
  </section>;
}
