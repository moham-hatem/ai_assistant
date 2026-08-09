export interface QualityMetricsCopy {
  apply: string;
  breakdown: {
    approved: string;
    attempts: string;
    channel: string;
    coverage: string;
    empty: string;
    language: string;
    medianClosure: string;
    openReviews: string;
    satisfaction: string;
  };
  cards: {
    approvedUsage: string;
    attempts: string;
    escalation: string;
    feedbackCoverage: string;
    medianClosure: string;
    openReviews: string;
    satisfaction: string;
  };
  definitions: Array<{ body: string; title: string }>;
  definitionsTitle: string;
  empty: string;
  error: string;
  filters: {
    all: string;
    channel: string;
    from: string;
    language: string;
    title: string;
    to: string;
    utc: string;
  };
  generatedAt: string;
  intro: string;
  invalidRange: string;
  invalidTime: string;
  labels: {
    answered: string;
    declined: string;
    failed: string;
    helpful: string;
    ofAttempts: string;
    ofFeedback: string;
    unhelpful: string;
  };
  loading: string;
  privacy: string;
  retry: string;
  title: string;
}
