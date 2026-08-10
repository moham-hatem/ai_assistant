# Local backups

This module creates self-validating local backup artifacts without wiring routes into the runtime.

Integration requirements:

- Configure only SQLite files and managed directories inside `data`.
- Keep the backup directory inside `data`, but outside every backed-up scope.
- Protect every handler route with `settings:manage`; the handler also requires the `admin` role.
- Supply both `beforeRestore` and `afterRestore` only when the integration can close every SQLite
  connection and pause writers before the filesystem swap, then recreate those resources afterward.
- If no explicit shutdown/restart coordinator exists, restore fails closed with HTTP 409. A stopped
  maintenance CLI is the preferred initial integration.

The archive never includes its own backup directory. Environment files, common key/credential file
names, and symbolic links are excluded. SQLite databases are copied with the native SQLite backup API,
so committed WAL data is captured without archiving `-wal` or `-shm` sidecars.
