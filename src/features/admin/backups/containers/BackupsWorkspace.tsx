import { CheckCircle2, TriangleAlert, X } from 'lucide-react';
import type { AppLanguage } from '../../../../i18n/language';
import { BackupList } from '../components/BackupList';
import { BackupMaintenanceNotice } from '../components/BackupMaintenanceNotice';
import { BackupPanelState } from '../components/BackupPanelState';
import { BackupToolbar } from '../components/BackupToolbar';
import { backupsCopies } from '../copy';
import { useBackups } from '../hooks/useBackups';

export function BackupsWorkspace({ language }: { language: AppLanguage }) {
  const copy = backupsCopies[language];
  const backups = useBackups();
  const { dispatch, state } = backups;
  const notice = state.notice ? copy[state.notice] : null;
  return <div className="backups-workspace">
    <BackupMaintenanceNotice copy={copy} />
    <BackupToolbar
      copy={copy}
      onCreate={() => { void backups.create(); }}
      onRefresh={() => dispatch({ type: 'retry' })}
      state={state}
    />
    {notice && <div className={`backups-notice${state.notice === 'failed' ? ' is-error' : ''}`} role={state.notice === 'failed' ? 'alert' : 'status'}>
      {state.notice === 'failed' ? <TriangleAlert aria-hidden="true" size={18} /> : <CheckCircle2 aria-hidden="true" size={18} />}
      <span>{notice}</span>
      <button aria-label={copy.close} onClick={() => dispatch({ type: 'notice-cleared' })} type="button"><X size={15} /></button>
    </div>}
    {state.loadStatus === 'loading' && <BackupPanelState copy={copy} kind="loading" />}
    {state.loadStatus === 'error' && <BackupPanelState copy={copy} kind="error" onRetry={() => dispatch({ type: 'retry' })} />}
    {(state.loadStatus === 'ready' || state.loadStatus === 'refreshing') && (
      state.backups.length === 0
        ? <BackupPanelState copy={copy} kind="empty" />
        : <BackupList
            copy={copy}
            language={language}
            onDownload={(id) => { void backups.download(id); }}
            onValidate={(id) => { void backups.validate(id); }}
            state={state}
          />
    )}
  </div>;
}
