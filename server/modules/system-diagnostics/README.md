# System diagnostics backend module

`createLocalSystemDiagnosticsService` builds bounded, read-only local readiness checks for the
core data stores, document storage, model configuration, OCR executables, and security-audit
integrity. It also reads the bounded Telegram runtime-status snapshot; this check never calls the
Telegram API and cannot start or stop the bot. `createSystemDiagnosticsHandler` serves the result from
`GET /api/internal/system-diagnostics`.

Integration requirements:

- Mount the handler behind the existing authenticated administrator route policy. The handler
  intentionally does not duplicate authentication or role checks.
- Pass the application version and `securityAudit.verifyIntegrity` to the factory.
- Do not mount the route on the public API surface.

The response never includes environment values, model keys, executable paths, absolute paths,
audit event contents, or command output. Paths below the workspace `data/` directory are shown
as relative paths; all other paths are reduced to their scope. The probes do not create, update,
or delete files and never contact a network service.
