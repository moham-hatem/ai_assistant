import type { AppLanguage } from '../../../i18n/language';
import type { AdminCopy } from '../adminCopy';
import { AdminPageHeader } from '../components/AdminPageHeader';
import { BackupsWorkspace } from './containers/BackupsWorkspace';
import { backupsCopies } from './copy';

export function AdminBackupsPage({ copy, language }: { copy: AdminCopy; language: AppLanguage }) {
  const backupCopy = backupsCopies[language];
  return <>
    <AdminPageHeader description={backupCopy.intro} eyebrow={copy.adminLabel} title={backupCopy.title} />
    <BackupsWorkspace language={language} />
  </>;
}
