import { BadgeCheck, CircleGauge, Clock3, MessageSquareMore, ShieldQuestion, Siren, Target } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { formatCount, formatDuration, formatPercent } from '../formatters';
import type { QualityMetricsCopy } from '../copy';
import type { QualityMetricSet } from '../types';

interface QualityMetricCardsProps { copy: QualityMetricsCopy; language: AppLanguage; metrics: QualityMetricSet }

export function QualityMetricCards({ copy, language, metrics }: QualityMetricCardsProps) {
  const cards = [
    { icon: <Target />, title: copy.cards.attempts, value: formatCount(metrics.answerAttempts, language), detail: `${formatCount(metrics.answered, language)} ${copy.labels.answered} · ${formatCount(metrics.declined, language)} ${copy.labels.declined} · ${formatCount(metrics.failed, language)} ${copy.labels.failed}` },
    { icon: <CircleGauge />, title: copy.cards.satisfaction, value: formatPercent(metrics.satisfactionRate, language), detail: `${formatCount(metrics.helpful, language)} ${copy.labels.helpful} / ${formatCount(metrics.feedbackCount, language)} ${copy.labels.ofFeedback}` },
    { icon: <MessageSquareMore />, title: copy.cards.feedbackCoverage, value: formatPercent(metrics.feedbackCoverageRate, language), detail: `${formatCount(metrics.feedbackCoveredAnswerAttempts, language)} / ${formatCount(metrics.answerAttempts, language)} ${copy.labels.ofAttempts}` },
    { icon: <Siren />, title: copy.cards.escalation, value: formatPercent(metrics.escalationRate, language), detail: `${formatCount(metrics.escalatedCount, language)} / ${formatCount(metrics.feedbackCount, language)} ${copy.labels.ofFeedback}` },
    { icon: <ShieldQuestion />, title: copy.cards.openReviews, value: formatCount(metrics.openReviewCount, language), detail: 'pending + in_review' },
    { icon: <Clock3 />, title: copy.cards.medianClosure, value: formatDuration(metrics.medianReviewClosureMs, language), detail: 'decided_at − created_at' },
    { icon: <BadgeCheck />, title: copy.cards.approvedUsage, value: formatCount(metrics.approvedAnswerUsageCount, language), detail: `${formatCount(metrics.approvedAnswerUsageCount, language)} / ${formatCount(metrics.answerAttempts, language)} ${copy.labels.ofAttempts}` },
  ];
  return <section className="quality-card-grid">{cards.map((card) => (
    <article className="quality-card" key={card.title}>
      <span className="quality-card-icon">{card.icon}</span>
      <div><h2>{card.title}</h2><strong>{card.value}</strong><p>{card.detail}</p></div>
    </article>
  ))}</section>;
}
