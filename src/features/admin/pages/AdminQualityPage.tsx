import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { QualityMetricsWorkspace } from '../quality-metrics/containers/QualityMetricsWorkspace';
import { qualityMetricsCopies } from '../quality-metrics/copy';

export function AdminQualityPage({ copy, language }: { copy: AdminCopy; language: AppLanguage }) {
  const qualityCopy = qualityMetricsCopies[language];
  return <>
    <AdminPageHeader
      description={qualityCopy.intro}
      eyebrow={copy.adminLabel}
      title={qualityCopy.title}
    />
    <QualityMetricsWorkspace language={language} />
  </>;
}
