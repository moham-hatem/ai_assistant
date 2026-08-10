import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { securityAuditCopies } from './copy';
import { SecurityAuditWorkspace } from './containers/SecurityAuditWorkspace';

export function AdminSecurityAuditPage({ copy, language }: { copy: AdminCopy; language: AppLanguage }) {
  const auditCopy = securityAuditCopies[language];
  return <>
    <AdminPageHeader description={auditCopy.intro} eyebrow={copy.adminLabel} title={auditCopy.title} />
    <SecurityAuditWorkspace language={language} />
  </>;
}
