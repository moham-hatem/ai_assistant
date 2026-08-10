import { backup, DatabaseSync } from 'node:sqlite';

export async function snapshotSqlite(sourcePath: string, destinationPath: string): Promise<void> {
  const database = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(database, destinationPath);
  } finally {
    database.close();
  }
}
