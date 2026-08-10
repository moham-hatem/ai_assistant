# Local backups

This module creates self-validating local backup artifacts without wiring routes into the runtime.

Integration requirements:

- Configure only SQLite files and managed directories inside `data`.
- Keep the backup directory inside `data`, but outside every backed-up scope.
- Protect every handler route with `settings:manage`; the handler also requires the `admin` role.
- The HTTP handler intentionally has no restore or deletion route. Restore is available only through
  the stopped maintenance CLI.
- Runtime HTTP handlers never expose restore or retention deletion. Both are maintenance CLI concerns.

The archive never includes its own backup directory. Environment files, common key/credential file
names, and symbolic links are excluded. SQLite databases are copied with the native SQLite backup API,
so committed WAL data is captured without archiving `-wal` or `-shm` sidecars.

## Offline restore

Restore is preview-only unless both `--apply` and the exact confirmation printed by preview are
provided. Stop Vite, Telegram polling, and every other process that can open a local SQLite database.

```text
npm run backup:restore -- --backup <uuid>
npm run backup:restore -- --backup <uuid> --apply --confirm RESTORE-<uuid>-<checksum-token>
```

The confirmation is bound to the selected artifact SHA-256. The command validates and decodes the
same bytes used by restore, obtains the shared maintenance admission lease, and checks stopped ports,
exclusive SQLite access, and writer sidecars. Schema migrations, Auth compatibility, Telegram
storage, and the security-audit HMAC chain are preflighted on disposable copies. The incoming and
installed snapshots are checksum-verified again; a failure before completion rolls back the swap.

Every restore creates a write-ahead `restore-journal.json` under its `.restore-*` workspace before
the first live rename and updates it around every swap and rollback step. Journal files and critical
renames are fsynced; parent-directory fsync is attempted where Node and the filesystem support it.
On Windows/filesystems that reject directory fsync, this provides process-crash durability and
fail-closed artifacts but does not claim a complete power-loss guarantee.

If rollback is incomplete, the workspace and `.maintenance.lock` are deliberately preserved.
Runtime startup refuses stale maintenance leases, unknown runtime locks, and any `.restore-*`
workspace. An operator must inspect the journal, complete recovery or rollback, and only then remove
the workspace and stale lease. They are never cleaned automatically.

Vite/local API, Telegram polling, the auth-user CLI, document rebuild, and semantic preparation all
participate in the same admission protocol before opening or changing backed-up local state.

## Retention maintenance

Retention never runs during backup creation or through HTTP. Preview is the default and prints an
inventory-bound confirmation token. `--keep` is always at least one, invalid artifacts fail the whole
plan closed, and only validated artifacts inside the configured backup directory can be deleted.

```text
npm run backup:retention -- --keep 7
npm run backup:retention -- --keep 7 --apply --confirm DELETE-BACKUPS-<preview-token>
```

The token is bound to every kept/deleted backup id and artifact SHA-256. Deletions are first renamed
into a private staging directory and re-hashed. A staging failure rolls all renames back. Purge starts
only after complete staging; if purge fails, the CLI reports the remaining recoverable staging
directory. Applying deletion requires the runtime to be stopped, and never runs automatically.
