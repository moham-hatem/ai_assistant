import type { BackupsCopy } from './types';

export const en: BackupsCopy = {
  appVersion: 'Application version', artifactSize: 'Backup file size', checkAgain: 'Check again',
  checkedAt: 'Integrity checked at', close: 'Dismiss message', create: 'Create backup', created: 'The backup was created safely.',
  createdAt: 'Created', creating: 'Creating backup…', download: 'Download',
  downloaded: 'The backup download has started.', downloading: 'Preparing download…',
  emptyBody: 'Create the first local snapshot of the managed databases, books, and required indexes.',
  emptyTitle: 'No backups yet', errorBody: 'Local backups could not be read. It is safe to try again.',
  errorTitle: 'Backups unavailable', failed: 'The operation could not be completed. No technical or sensitive details were shown.',
  fileCount: 'Files', formatVersion: 'Backup format version',
  intro: 'Create, validate, and download trustworthy local snapshots of managed project data.',
  loading: 'Loading backups…',
  maintenanceBody: 'Restore cannot run from the website while the server is active. It will be performed later in maintenance mode after stopping the server and every SQLite connection, followed by restart and health verification. Downloaded artifacts contain account, question-log, and content data and must be stored securely.',
  maintenanceTitle: 'Restore requires maintenance mode', refresh: 'Refresh list', retry: 'Try again',
  title: 'Backups', totalSize: 'Original data size', validate: 'Validate integrity',
  validated: 'The backup is valid and every checksum matches.', validating: 'Validating backup…',
};
