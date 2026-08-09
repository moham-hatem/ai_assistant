# Local security audit

This module stores minimized, allowlisted security events in a dedicated local SQLite database.
Rows are append-only under normal application access and form a `previousHash`/`eventHash` HMAC
chain. The HMAC key is supplied only through runtime environment variables and is never stored in
SQLite. This is **tamper-evident, not tamper-proof**: an operator who controls the database and the
key can replace history.

Sensitive changes in the auth, books, and reviews SQLite databases enqueue their audit command in
`security_audit_outbox` in the same transaction as the business change. Delivery to the separate
audit database is idempotent and retried during runtime startup and after writes. SQLite cannot make
one atomic transaction span these database connections, so a committed business change may briefly
precede its appearance in the audit database; the durable outbox is the source of recovery. OCR
state is also stored on the filesystem and cannot be atomic with SQLite. The HTTP operation fails
closed when audit delivery is unavailable, while the edition transition outbox preserves recovery.

Never add arbitrary metadata. The domain allowlist deliberately excludes passwords, session tokens,
cookies, full questions or answers, book/document text, and other content.
`actorUserId = null` represents an unauthenticated or server-initiated event; user-triggered actions
take the actor only from the authenticated principal, never from request content.
