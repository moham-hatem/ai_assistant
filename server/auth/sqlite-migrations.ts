import type { DatabaseSync } from 'node:sqlite';

const migrations = [
  `
    CREATE TABLE auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL CHECK (
        length(password_hash) >= 80 AND password_hash LIKE 'scrypt$v=%'
      ),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (email = lower(trim(email)))
    ) STRICT;

    CREATE TABLE auth_user_roles (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (
        role IN ('reviewer', 'content_manager', 'operator', 'admin')
      ),
      PRIMARY KEY (user_id, role)
    ) STRICT;

    CREATE TABLE auth_sessions (
      token_hash TEXT PRIMARY KEY CHECK (
        length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'
      ),
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      idle_expires_at TEXT NOT NULL,
      absolute_expires_at TEXT NOT NULL,
      revoked_at TEXT,
      CHECK (idle_expires_at <= absolute_expires_at)
    ) STRICT;

    CREATE INDEX auth_sessions_user_active_idx
      ON auth_sessions (user_id, revoked_at, absolute_expires_at);
  `,
  `
    ALTER TABLE auth_users ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Local User'
      CHECK (
        length(display_name) BETWEEN 1 AND 80
        AND display_name = trim(display_name)
        AND instr(display_name, char(0)) = 0
      );
  `,
  `
    ALTER TABLE auth_users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1
      CHECK (enabled IN (0, 1));

    CREATE TABLE auth_invitations (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE CHECK (
        length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'
      ),
      email TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES auth_users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      CHECK (email = lower(trim(email))),
      CHECK (expires_at > created_at),
      CHECK (NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL))
    ) STRICT;

    CREATE TABLE auth_invitation_roles (
      invitation_id TEXT NOT NULL REFERENCES auth_invitations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (
        role IN ('reviewer', 'content_manager', 'operator', 'admin')
      ),
      PRIMARY KEY (invitation_id, role)
    ) STRICT;

    CREATE TABLE auth_recovery_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE CHECK (
        length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'
      ),
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_by_user_id TEXT NOT NULL REFERENCES auth_users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      revoked_at TEXT,
      CHECK (expires_at > created_at),
      CHECK (NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL))
    ) STRICT;

    CREATE INDEX auth_invitations_active_idx
      ON auth_invitations (email, expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;
    CREATE INDEX auth_recovery_active_idx
      ON auth_recovery_tokens (user_id, expires_at) WHERE used_at IS NULL AND revoked_at IS NULL;
  `,
] as const;

export function migrateAuthDatabase(database: DatabaseSync): void {
  const version = validateAuthMigrationHistory(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
  for (let index = version; index < migrations.length; index += 1) {
    database.exec('BEGIN IMMEDIATE;');
    try {
      database.exec(migrations[index]);
      database.prepare(`
        INSERT INTO auth_schema_migrations (version, applied_at)
        VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      `).run(index + 1);
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
  }
}

export function validateAuthMigrationHistory(database: DatabaseSync): number {
  const exists = database.prepare(`
    SELECT 1 AS present FROM sqlite_master
    WHERE type = 'table' AND name = 'auth_schema_migrations'
  `).get() as unknown as { present: number } | undefined;
  if (!exists) return 0;
  const versions = (database.prepare(`
    SELECT version FROM auth_schema_migrations ORDER BY version
  `).all() as unknown as Array<{ version: number }>).map((row) => row.version);
  if (versions.some((version, index) => version !== index + 1)) {
    throw new Error('Auth database migration history is incomplete or unsupported.');
  }
  if (versions.length > migrations.length) {
    throw new Error(`Auth database schema version ${versions.length} is newer than supported.`);
  }
  return versions.length;
}
