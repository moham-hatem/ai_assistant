# Local team authentication

The auth module is deliberately independent from the Vite local API. Wire the exported
`createAuthHandler` through the application's server port. It uses SQLite, Node's built-in
`crypto.scrypt`, opaque server-side sessions, strict same-origin checks, and HttpOnly cookies.

Create or update a local user by piping the password, so it is not stored in shell history:

```sh
printf '%s' "$PASSWORD" | npm run auth:user -- --email reviewer@example.org --roles reviewer
```

For non-interactive provisioning, `AUTH_BOOTSTRAP_PASSWORD` is supported, but environment
variables may be visible to process inspection or CI logs. Never pass a password as a command
argument; the CLI rejects password arguments and never prints the password. Set
`AUTH_DATABASE_PATH` to override `data/auth.sqlite`.

Production requires an HTTPS `AUTH_PUBLIC_ORIGIN`. Production cookies use
`__Host-ila_session; Secure; HttpOnly; SameSite=Strict; Path=/` and never set `Domain`.
Development uses the separate non-Secure `ila_local_session` cookie.
