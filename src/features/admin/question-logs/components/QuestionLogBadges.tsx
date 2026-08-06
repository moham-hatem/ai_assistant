import type { QuestionLogsCopy } from '../copy';
import type { QuestionLogSummary } from '../types';

interface QuestionLogBadgesProps {
  copy: QuestionLogsCopy;
  record: Pick<QuestionLogSummary, 'channel' | 'status'>;
}

export function QuestionLogBadges({ copy, record }: QuestionLogBadgesProps) {
  return (
    <span className="question-log-badges">
      <span className={`question-log-badge question-log-status-${record.status}`}>
        {copy.statuses[record.status]}
      </span>
      <span className="question-log-badge question-log-channel">
        {copy.channels[record.channel]}
      </span>
    </span>
  );
}
