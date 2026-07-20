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

## Amendment (2026-07-19): the mechanism, re-decided at Phase 1 session 3

The Note's homework is done; the home timeline is implemented
(`src/pages/timeline/`) on the following mechanism, which supersedes the
"createResource plus a Solid store" sentence in the Decision:

- **No `createResource`.** Plain async functions feed Solid signals, with
  hand-rolled loading flags. As the Note predicted: with errors flowing as
  Result values to components (ADR-0008), createResource's throw-based
  Suspense integration buys nothing — and a retrofit escape hatch exists
  (createResource's `storage` option) if that ever changes.
- **Segment model.** The timeline is an array of contiguous status
  segments, newest-first; a gap is not separate state but a segment
  boundary. Infinite scroll extends the last segment's tail via `max_id`;
  manual refresh fetches forward with `since_id=<head id>` (a full
  40-item clamp means a possible gap → push a new head segment); gap fill
  reuses the same `max_id` tail-extension until IDs overlap and segments
  merge. Merge/overlap/dedup logic is pure functions (`segments.ts`),
  tested thickly without DOM or MSW (ADR-0009).
- **Component-scoped store, no route `preload`.** The store is created in
  the page component and loads on mount; login/logout always pass through
  navigation, so no module singleton is needed. Refetch-on-return is
  accepted (the scroll-retention story is iceboxed).
- **Scroll position is delegated to browser scroll anchoring.** No
  correction code. The obligation this creates: card DOM must stay stable
  across store updates (flat status-level rendering keyed by stable
  references, `overflow-anchor: none` on non-card rows) so a card — not a
  chrome row — is always the anchor candidate. WebKit has not shipped
  scroll anchoring in stable Safari (Technical Preview only — caniuse
  `css-overflow-anchor`, checked 2026-07), so prepends may still shift the
  viewport there; accepted rather than compensated in code.

The rest of the Decision stands: no solid-query, `query()` for entity
fetches, rule-of-three before extracting a shared timeline primitive, and
the Phase 2 exit line.

## References

- https://docs.solidjs.com/solid-router/reference/data-apis/query
- https://github.com/solidjs/solid-router/discussions/340 (hand-rolled
  pagination is the only documented pattern)
- npm registry release history for @tanstack/solid-query (v4/v5/v6 dates),
  checked 2026-07
- Prior-art survey: Elk, Phanpy, Soapbox, pleroma-fe (2026-07)
