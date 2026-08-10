import { CheckCircle2, Download, FileCheck2, LoaderCircle } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import type { BackupsCopy } from '../copy';
import { formatBackupBytes, formatBackupDate } from '../format';
import type { BackupSummary } from '../types';
import type { BackupsState } from '../backup-state';

export function BackupList({ copy, language, onDownload, onValidate, state }: {
  copy: BackupsCopy;
  language: AppLanguage;
  onDownload: (id: string) => void;
  onValidate: (id: string) => void;
  state: BackupsState;
}) {
  return <ul className="backups-list">
    {state.backups.map((backup) => {
      const validating = state.operation?.kind === 'validate' && state.operation.backupId === backup.id;
      const downloading = state.operation?.kind === 'download' && state.operation.backupId === backup.id;
      const validatedAt = state.validatedAt[backup.id];
      return <li className="backup-card" key={backup.id}>
        <header>
          <div><span>{copy.createdAt}</span><strong>{formatBackupDate(backup.createdAt, language)}</strong></div>
          <code title={backup.id}>{backup.id.slice(0, 8)}</code>
        </header>
        <dl>
          <Metric label={copy.artifactSize} value={formatBackupBytes(backup.artifactBytes, language)} />
          <Metric label={copy.totalSize} value={formatBackupBytes(backup.totalBytes, language)} />
          <Metric label={copy.fileCount} value={new Intl.NumberFormat(language).format(backup.fileCount)} />
          <Metric label={copy.appVersion} value={backup.appVersion} />
          <Metric label={copy.formatVersion} value={String(backup.formatVersion)} />
        </dl>
        {validatedAt && <p className="backup-validation-status">
          <CheckCircle2 aria-hidden="true" size={16} />
          {copy.checkedAt}: {formatBackupDate(validatedAt, language)}
        </p>}
        <footer>
          <button disabled={state.operation !== null} onClick={() => onValidate(backup.id)} type="button">
            {validating ? <LoaderCircle aria-hidden="true" className="backups-spin" size={16} /> : <FileCheck2 aria-hidden="true" size={16} />}
            {validating ? copy.validating : validatedAt ? copy.checkAgain : copy.validate}
          </button>
          <button className="is-secondary" disabled={state.operation !== null} onClick={() => onDownload(backup.id)} type="button">
            {downloading ? <LoaderCircle aria-hidden="true" className="backups-spin" size={16} /> : <Download aria-hidden="true" size={16} />}
            {downloading ? copy.downloading : copy.download}
          </button>
        </footer>
      </li>;
    })}
  </ul>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
