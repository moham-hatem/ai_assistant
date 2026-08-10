import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { systemDiagnosticsCopies } from './copy';
import { SystemDiagnosticsWorkspace } from './containers/SystemDiagnosticsWorkspace';

export function AdminSystemDiagnosticsPage({ copy, language }: {
  copy: AdminCopy;
  language: AppLanguage;
}) {
  const diagnosticsCopy = systemDiagnosticsCopies[language];
  return <>
    <AdminPageHeader
      description={diagnosticsCopy.intro}
      eyebrow={copy.adminLabel}
      title={diagnosticsCopy.title}
    />
    <SystemDiagnosticsWorkspace language={language} />
  </>;
}
