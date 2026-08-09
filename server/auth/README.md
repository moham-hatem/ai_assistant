# Local team authentication

The Vite local API initializes `SqliteAuthRepository`, `AuthService`, and `createAuthHandler`
from the `AUTH_*` values loaded by Vite. `/api/auth/*` is dispatched before the admin guard;
protected routes resolve the same server-side session into an `AuthPrincipal` and check shared
permissions. The repository is closed with the development HTTP server. Authentication uses
SQLite, Node's built-in `crypto.scrypt`, opaque server-side sessions, strict same-origin checks,
and HttpOnly cookies.

Create or update a local user by piping the password, so it is not stored in shell history:

```sh
printf '%s' "$PASSWORD" | npm run auth:user -- --email reviewer@example.org \
  --display-name "Local Reviewer" --roles reviewer
```

For non-interactive provisioning, `AUTH_BOOTSTRAP_PASSWORD` is supported, but environment
variables may be visible to process inspection or CI logs. Never pass a password as a command
argument; the CLI rejects password arguments and never prints the password. Set
`AUTH_DATABASE_PATH` to override `data/auth.sqlite`. Local auth databases and their SQLite
sidecars are ignored by Git through `data/auth.sqlite*`.

`displayName` is required for new and updated users, normalized to NFC with collapsed
whitespace, and limited to 80 Unicode characters and 160 UTF-8 bytes. Databases created by
the earlier schema migrate existing users to the explicit non-identifying fallback `Local User`.

Permissions are derived deny-by-default: reviewers can review content; content managers can
read/write books, review content, and read question logs and quality metrics; operators receive
the same read-only operational access without content review; admins receive only
`settings:manage`. Admin does not imply any content permission.

The replaceable login rate-limit port records failed credential checks only. A successful login
clears prior failures for the same client/email key; account-missing and wrong-password failures
remain indistinguishable to callers.

Production requires an HTTPS `AUTH_PUBLIC_ORIGIN`. Production cookies use
`__Host-ila_session; Secure; HttpOnly; SameSite=Strict; Path=/` and never set `Domain`.
Development uses the separate non-Secure `ila_local_session` cookie.
Its default same-origin value is `http://127.0.0.1:5173`; override `AUTH_PUBLIC_ORIGIN` when
the development server is deliberately exposed on another origin. Admin write protection uses
this configured origin too; it does not derive the trusted origin from the request `Host` header.

## Local team access management

Team access is managed only through the local SQLite backend. Routes under
`/api/internal/access/*` require `settings:manage` and use the same session and trusted-origin
guard as other admin writes. The API provides bounded cursor pagination, safe user details,
display-name/role updates, enable/disable actions, full session revocation, invitations, and
password recovery. Responses never include password hashes, session tokens, or stored token
hashes.

Invitations use `POST /api/internal/access/invitations`; password setup is redeemed through
`POST /api/auth/invitations/redeem`. Recovery links are created per user through
`POST /api/internal/access/users/:id/recovery` and redeemed through
`POST /api/auth/recovery/redeem`. Both public redemption endpoints require the configured
`AUTH_PUBLIC_ORIGIN`, strict JSON bodies, and rate limiting. Invitation links expire after 24
hours; recovery links expire after one hour. They are 256-bit random secrets, stored only as
SHA-256 hashes, single-use, and revocable. No email is sent: the creating administrator receives
the secret link exactly once in the creation response and must handle it as a password-equivalent
secret. The server does not log it.

Existing users migrate to `enabled`. Disabled users cannot log in or refresh a session, and all
their active sessions are revoked. Role and enablement changes are transactional: the last
enabled admin cannot be disabled or stripped of `admin`, and administrators cannot disable
themselves or remove their own `settings:manage` access.
