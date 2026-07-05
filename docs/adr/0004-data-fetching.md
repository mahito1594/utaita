# 0004: Server state via solid-router primitives; hand-rolled cursor pagination

- Status: accepted
- Date: 2026-07-04

## Context

Timelines need cached, paginated, refetchable data. An earlier draft of this
ADR chose @tanstack/solid-query. Re-examined: @solidjs/router — already a
dependency — ships its own data layer (`query()`, `createAsync`,
`createAsyncStore`, route `preload`, `action()` + `revalidate()`) whose
`query()` cache is deduplicating and subscriber-scoped, revalidated after
actions or manually. It has no stale-time, focus refetch, or page
accumulation; infinite cursor pagination must be hand-rolled (the docs note
`query` does not compose with `createResource`, and no official
infinite-scroll pattern exists — solid-router discussion #340).

solid-query is TanStack's official Solid adapter, but majors break APIs on a
regular cadence (v4 2022-07, v5 2023-10, v6 in beta as of 2026-06 — adopting
v5 now means an early migration), and `useInfiniteQuery` abstracts away
exactly the cursor pagination that Phase 1 names as a learning goal.

## Decision

Use solid-router's data primitives for server state: `query()` +
`createAsync`/`createAsyncStore` with route `preload` for entity fetches
(threads, profiles, notifications). Build timeline infinite scroll by hand:
`createResource` plus a Solid store accumulating `max_id`-cursor pages,
with an IntersectionObserver sentinel. Start home-timeline-specific and
extract a shared primitive only when a third timeline needs it (rule of
three, see process.md). Do not adopt @tanstack/solid-query. No list
virtualization initially; pick a library rather than hand-rolling if
timeline performance ever demands it.

## Consequences

- Cursor management, cache freshness, and cross-view updates are ours to
  own, in transparent Solid primitives rather than a black-box cache —
  aligned with the project's learning goals.
- No built-in focus refetch or polling; wire `visibilitychange` +
  `revalidate()` where needed.
- Exit line: if Phase 2 cross-view cache updates (reflecting a favourite
  across timeline, thread, and profile at once) become unmanageable without
  a normalized cache, supersede this ADR and reconsider solid-query.
- One fewer dependency, and no TanStack v5→v6 migration at project start.

## Note (2026-07-05)

"createResource plus a Solid store" above is mechanism detail, not the
decision's essence (no solid-query; hand-rolled accumulation; query for
entity fetches). With errors now flowing as Result values all the way to
components (ADR-0008 amendment), createResource's throw-based Suspense
integration buys little — a plain async function feeding a store, with a
hand-rolled loading signal, may fit better. Re-decide the mechanism at
Phase 1 kickoff, in front of the real requirements (scroll retention,
CW toggling without scroll jumps, prepending new statuses).

## References

- https://docs.solidjs.com/solid-router/reference/data-apis/query
- https://github.com/solidjs/solid-router/discussions/340 (hand-rolled
  pagination is the only documented pattern)
- npm registry release history for @tanstack/solid-query (v4/v5/v6 dates),
  checked 2026-07
- Prior-art survey: Elk, Phanpy, Soapbox, pleroma-fe (2026-07)
