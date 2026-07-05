# 0006: Where the dev access token is injected before OAuth exists

- Status: draft
- Date: 2026-07-05

## Context

The reference instance restricts timeline viewing to authenticated users:
`GET /api/v1/timelines/public` returns 401
`{"error": "authorization required for timeline view"}` (verified 2026-07-05).
Directory, account, and individual status endpoints are readable without auth.

OAuth login is a Phase 1 deliverable, but the Phase 0 done condition renders a
timeline, so Phase 0 needs a manually issued access token for development.
Two injection points are possible:

1. **Vite dev proxy** adds the `Authorization` header server-side from an env
   var. The token never reaches the client bundle or browser storage, but the
   auth-injection path of the fetch wrapper goes unexercised until OAuth lands.
2. **Fetch wrapper** reads the token from `import.meta.env` and injects the
   header client-side — the same code path OAuth tokens will use in Phase 1,
   at the cost of the token being embedded in the dev bundle.

## Decision

Deferred. Decide at the start of the session that implements the fetch
wrapper and dev proxy (both are Phase 0 tasks; this choice shapes both).

## Consequences

- Until decided, the 401-handling requirement stays testable either way: an
  unset token must surface a handled 401 in the UI (per the Phase 0 done
  condition in stories).

## References

- Phase 0 done condition: [stories.md](../stories.md)
- Fetch wrapper scope: [ADR-0002](./0002-api-client.md)
