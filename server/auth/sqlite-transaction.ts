import type { DatabaseSync } from 'node:sqlite';

export function withImmediateTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const value = operation();
    database.exec('COMMIT;');
    return value;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
