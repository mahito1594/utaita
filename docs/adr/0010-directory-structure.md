# 0010: Directory structure — entities/pages, not feature slices

- Status: accepted
- Date: 2026-07-05

## Context

The first page (home timeline) needed a home, and PLAN had been assuming a
"feature-based" directory structure without ever defining it. Stress-testing
the obvious candidate — vertical feature slices (`src/features/timeline/`,
`src/features/status/`, …) — against Phase 1's known scope showed the
premise of "independent verticals" breaking in three ways:

1. **Status is a hub, not a peer.** A fediverse client is a small set of
   shared entities (Status, Account) rendered by many screens. Timeline,
   thread, profile, and notifications would all import the status slice;
   when every slice imports the same one, that one is a de facto shared
   kernel and the flat `features/` listing misrepresents the architecture.
2. **Page slices are thin.** The heavy logic (CW, custom emoji,
   `pleroma.content` MIME maps, unknown-notification-type tolerance) lives
   in entity interpretation and rendering, not in the pages that host it.
3. **Unclassifiable residents accumulate.** status has no URL, auth is
   cross-cutting, compose (Phase 2) embeds everywhere — each needs an
   excuse. A taxonomy that demands excuses is wrong.

## Decision

```
src/
  api/         # transport: client, toResult, Result, generated schema — nothing more
  app/         # composition root: router wiring, layout, the one ErrorBoundary
  entities/    # shared domain rendering and interpretation (status/, account/, …)
  pages/       # routed screens (timeline/, …); own their query() definitions
```

- Dependencies point one way: `app → pages → entities → api`. No sideways
  imports between pages, none between entities, nothing imports app.
- The classification test is mechanical: **does it have a URL?** Pages do,
  entities do not.
- **No endpoint-function layer.** openapi-fetch is fully typed by path, so a
  `pages/*/queries.ts` `query()` definition *is* the endpoint call. A
  standalone fetch function is extracted only when something outside a query
  needs the same call (Phase 1's pagination store is the first candidate) or
  at a third caller.
- Query cache keys are a UI concern and belong to pages. Names are
  colon-scoped (`timeline:home`) so related entries can be revalidated by
  prefix later.
- A shared UI layer (`src/ui/`) is **reserved, not created**: it appears
  only after the design system lands and a third occurrence forces an
  extraction (rule of three). Its position is fixed now — below entities,
  a leaf beside api.
- Where auth state lives is deferred until the OAuth implementation takes
  shape in Phase 1 (likely `app/`, as session wiring).

## Consequences

- In backend vocabulary: `app` ≈ composition root, `pages` ≈ application
  layer, `entities` ≈ domain, `api` ≈ infrastructure — useful as a reading
  aid, but the recorded vocabulary stays entities/pages; a frontend's
  "usecase layer" dissolves into query definitions plus JSX composition and
  is not worth reifying.
- Directory structure does not solve Phase 2's cross-view cache updates
  (reflecting a favourite across timeline, thread, and profile). That is a
  cache-key/registry problem owned by ADR-0004's exit line, whatever the
  folders look like.

## Alternatives rejected

- **`src/features/` vertical slices** — see Context; the structure would
  lie about status being a peer.
- **`src/api/endpoints/` middle layer** — a pile of one-line forwarders;
  discoverability is served by the generated types and grep at this scale.
- **Full Feature-Sliced Design taxonomy** (features/widgets/entities) — the
  features-vs-widgets distinction generates placement debates a solo
  project cannot afford; two categories with a mechanical test suffice.

## Amendment (2026-07-12): the OAuth callback is app machinery, not a page

Phase 1's OAuth work produced the first recorded exception to the
mechanical "does it have a URL?" test. The `/oauth-callback` route
component lives in `app/`, not `pages/`: its whole job is writing session
state — composition-root business — and a page could not import the
session shell without breaking the one-way dependency rule (nothing
imports app). The URL exists only because the authorization code flow
needs a fixed landing path. Comparable clients treat the callback the
same way: Phanpy parses the code in its root component, Elk in an
app-level plugin; neither has a callback page.

Two adjacent placements, recorded at the same time:

- Token persistence and auth-header injection sit at the bottom
  (`api/token-store.ts`), so lower layers can reach auth facts without
  importing `app`. If a page ever needs "current user" data (Phase 2
  compose is the likely first), push that piece down — an `api/`-level
  call or an entity — never import `app`.
- Endpoints the instance spec does not declare as paths (`/oauth/token`
  and `/oauth/revoke` appear only as security-scheme URLs) get
  hand-written transport in `api/` (`api/oauth.ts`), folded into the same
  `Result` convention as `toResult`. The Decision's "api/: nothing more"
  reads as "transport only", not "generated calls only".

## References

- Server-state primitives and pagination ownership: [ADR-0004](./0004-data-fetching.md)
- Error values consumed in the UI: [ADR-0008](./0008-api-errors-as-values.md)
