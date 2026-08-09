# Local security audit

This module stores minimized, allowlisted security events in a dedicated local SQLite database.
Rows are append-only under normal application access and form a `previousHash`/`eventHash` HMAC
chain. A singleton authenticated local head is updated in the same transaction as each append, so
integrity verification detects deletion of the tail while that head remains. The HMAC key is
supplied only through runtime environment variables and is never stored in SQLite. This is
**tamper-evident, not tamper-proof**. `local_authenticated_head` is deliberately not called an
external checkpoint: rollback or replacement of both the database events and its local head cannot
be detected without an independently stored anchor, and an operator who has the key can replace
history. Upgrading a v1 database verifies every historical event with its recorded key version
inside the upgrade transaction before creating the authenticated head. The v3 access-event schema
also verifies the full chain and authenticated head before replacing any table. Missing or
mismatched keys and invalid history leave the previous schema unchanged.

Before using authenticated administration locally, run `npm run audit:init`. It generates a fresh
256-bit key, writes it to the Git-ignored `.env.local`, and never prints it. The command fills an
empty placeholder but refuses to overwrite an existing key. Keep the key secret and backed up: it
is required to verify the audit chain. Public answer and version endpoints remain available when
the audit configuration is absent, while sensitive operations and successful login fail closed.

Sensitive changes in the auth, books, and reviews SQLite databases enqueue their audit command in
`security_audit_outbox` in the same transaction as the business change. Delivery to the separate
audit database is idempotent and retried during runtime startup and after writes. SQLite cannot make
one atomic transaction span these database connections, so a committed business change may briefly
precede its appearance in the audit database; the durable outbox is the source of recovery. OCR
state is also stored on the filesystem and cannot be atomic with SQLite. Before approving the file
state, the books database stores an approval intent; retry accepts the already-ready file and
atomically changes the edition plus enqueues its audit event. The HTTP operation fails closed when
audit delivery is unavailable, while the durable intent/outbox preserves recovery.

Public answers and the public version endpoint do not depend on audit readiness. Missing key or a
corrupt audit database leaves those routes available, but login success, audit reads, and sensitive
administrative writes fail with `503` until audit delivery recovers. Use `npm run audit:init`; it
updates `.env.local` directly and never exposes the generated key in terminal output.

The access lifecycle records profile and role changes, enable/disable operations, session
revocation, and invitation/recovery creation, revocation, and redemption. Administrative events
take their actor from the authenticated principal. Public redemption uses a null actor and records a
user subject only after the transactional redemption succeeds.

Never add arbitrary metadata. The domain allowlist deliberately excludes emails, passwords, session
tokens, links, raw hashes, cookies, full questions or answers, book/document text, and other content.
`actorUserId = null` represents an unauthenticated or server-initiated event; user-triggered actions
take the actor only from the authenticated principal, never from request content.
