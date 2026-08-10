import type { BackupDownload } from './api/backups';

export function saveBackupDownload(download: BackupDownload): void {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement('a');
  try {
    anchor.download = download.fileName;
    anchor.href = url;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
