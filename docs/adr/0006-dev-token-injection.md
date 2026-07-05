# 0006: Dev access token is injected by the Vite proxy, discarded when OAuth lands

- Status: accepted
- Date: 2026-07-05

## Context

The reference instance restricts timeline viewing to authenticated users:
`GET /api/v1/timelines/public` returns 401
`{"error": "authorization required for timeline view"}` (verified 2026-07-05).
Directory, account, and individual status endpoints are readable without auth.

OAuth login is a Phase 1 deliverable. Phase 0 deliberately comes before it:
the point is to verify real API behavior and build the typed client, proxy,
and rendering slice with as few moving parts as possible. So development
needs a manually issued access token until the OAuth flow exists.

Three designs were considered for getting that token onto requests:

1. The Vite dev proxy adds the `Authorization` header server-side, reading
   the token from an env var (`.env.local`, covered by the existing `*.local`
   gitignore pattern).
2. The fetch wrapper reads a `VITE_`-prefixed env var via `import.meta.env`
   and injects the header client-side — the same code path Phase 1 OAuth
   tokens would use.
3. Seed `localStorage` by hand in devtools, mimicking the Phase 1 session
   store exactly, with no env var at all.

The deciding principle: this mechanism is scaffolding. When the OAuth flow
lands in Phase 1, the old implementation is deleted wholesale rather than
migrated. That makes isolation and disposability the value to optimize, and
makes production-path parity — the sole advantage of options 2 and 3 —
worthless. Option 3 is additionally fiddly (per browser profile, wiped with
site data).

## Decision

The Vite dev proxy injects the `Authorization` header server-side. The token
lives in `.env.local` without a `VITE_` prefix, read in `vite.config.ts` via
`loadEnv` (Vite does not auto-load `.env*` files into `process.env` during
config evaluation). Client code contains no dev-token logic. When OAuth lands
in Phase 1, delete the proxy injection outright.

## Consequences

- The token never reaches the browser or any bundle.
- The fetch wrapper's own auth-injection path stays unexercised until
  Phase 1. Accepted: the wrapper's 401 handling is still testable by leaving
  the env var unset (per the Phase 0 done condition).
- Removal is a few lines in `vite.config.ts`; nothing to clean up in app
  code.

## References

- Phase 0 done condition: [stories.md](../stories.md)
- Phase 1 token acquisition and storage: [ADR-0003](./0003-oauth.md)
- Fetch wrapper scope: [ADR-0002](./0002-api-client.md)
