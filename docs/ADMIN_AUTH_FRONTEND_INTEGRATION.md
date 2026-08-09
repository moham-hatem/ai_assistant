# Admin authentication frontend integration

The React client uses a server-owned, same-origin cookie session. It never stores the password, a token, or the principal in `localStorage` or `sessionStorage`.

## HTTP contract

- `POST /api/auth/login` with `Content-Type: application/json`, `credentials: same-origin`, and `{ "email": string, "password": string }` returns `{ "principal": AuthPrincipal, "requestId": string }`.
- `GET /api/auth/session` with `credentials: same-origin` returns `{ "principal": AuthPrincipal | null, "requestId": string }`.
- `POST /api/auth/logout` with `credentials: same-origin` returns `204` with no body.
- `401` from any administration data client invalidates the in-memory principal and returns the UI to the login gate.
- `403` keeps the session authenticated and displays a missing-permission notice.
- Error response bodies are not rendered by the client.

`AuthPrincipal` is imported from `shared/contracts/auth.ts` and has this shape:

```ts
interface AuthPrincipal {
  id: string;
  email: string;
  displayName: string;
  roles: AuthRole[];
  permissions: AuthPermission[];
}
```

`principal.id` is mapped to existing review `reviewerId` payloads through `reviewerIdFromPrincipal`, leaving one replacement point if that backend contract changes.

## Permission names

The server remains the security boundary. The frontend uses these strings only to hide navigation, pages, and controls:

- `books:read`, `books:write`
- `content:review`
- `question_logs:read`
- `quality:read`
- `settings:manage`

The parser rejects wildcard, unknown permission, and unknown role values. Roles never imply permissions in the client. The dashboard is available to every authenticated principal and shows cards only for pages that principal may open.

Book uploads, edition transitions, reprocessing, and legacy document mutations require `books:write`. Approving a `review_required` OCR result requires `content:review`. Review queue actions also require `content:review`.

## Redirect contract

The login route is `#/admin/login`. Its optional `returnTo` query value must be exactly one of the known `/admin/<page>` paths. External URLs, nested paths, the login path itself, and unknown page names fall back to the dashboard.
