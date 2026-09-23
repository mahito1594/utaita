# 0016: Reflecting a write across every view of a status

- Status: draft
- Date: 2026-09-23

## Context

The same status is held in five places, each as its own object: the timeline
segments (`src/pages/timeline/timeline-store.ts`), the cursor list behind a
profile's posts and follow lists (`src/pages/profile/cursor-list-store.ts`),
the pinned strip's `query()` (`src/pages/profile/ProfilePage.tsx`), the
thread's `query()` (`src/pages/thread/thread-query.ts`), and the retention
snapshots (`src/entities/retention/retention.tsx`, typed `unknown`). Rows
are identified by object reference, and a card keeps state of its own (the
CW toggle in `StatusCard.tsx` and `QuoteCard.tsx`, the reveal in
`MediaGrid.tsx`). None of the five offers a way to replace one status.

The favourite / boost / bookmark / reaction story
([stories.ja.md](../stories.ja.md), Phase 2) is the first write whose
result must show on every view of the status at once, and ADR-0004 named
exactly this as its exit line. Reaching that line with the primitives ADR-0004
chose — `action()` + `revalidate()` — costs more than it looks:

- The timeline and the cursor lists are not queries, so `revalidate()` does
  not reach them.
- Revalidating the thread refetches subject and context and rebuilds every
  row (`ThreadPage.tsx` says so of its own ingest path), which closes an open
  CW and drops focus from the button that was just pressed.
- A favourite made in the thread is undone on the way back: the timeline
  restores its snapshot, which still holds the pre-write status.
- Replacing the object inside a holder recreates the card, with the same
  CW and focus loss; a snapshot cannot be updated while its page is unmounted.
- solid-router's `query.set` replaces the cache entry without notifying the
  screens subscribed to the old one.

## Options

**A. A canonical status store keyed by id.** Every list holds order and ids;
cards read the canonical status; one place receives the write's response.
This is the normalized cache ADR-0004's exit line points at. Its cost is a
redesign of the Phase 1 holders: the segment model, the cursor list,
retention's reference identity, and an eviction policy that none of them
needs today.

**B. An overlay of the viewer's own flags, keyed by id, in
`src/entities/status/`.** It holds only `favourited`, `reblogged`,
`bookmarked` and the reaction `me` flags, written from the response of the
write API. `StatusCard`'s one read point (`subject()`) merges it over the
status it was given; counts are shown as the server's count plus the
difference between the overlay flag and the server flag, so views with
data of different ages agree, and a later refetch settles them. The five
holders, the snapshots and the thread tree are untouched. Logout reloads
the document (ADR-0015), so the overlay's lifetime needs no handling. Its
cost is a second source of truth beside the server's value: a boost
response is a wrapper, so the key must be `reblog.id`; a failed write must
be rolled back in the overlay; and a status that leaves every view keeps its
entry until reload.

Both options leave the UI side alone: `open-thread.ts` already excludes
buttons from the card-wide tap, so `ActionBar` becoming interactive costs
nothing there.

## Decision

Not taken. To be decided before the reaction story starts. If B is chosen,
ADR-0004's exit line is amended rather than triggered: the ADR stands, and
the normalized cache stays the fallback for the day the overlay's second
source of truth becomes the problem.

## Consequences

Deferred with the decision.

## References

- ADR-0004, Consequences (the exit line) and the 2026-08-09 and 2026-09-12
  amendments (what a retention snapshot holds)
- ADR-0015 (logout reloads the document)
- `@solidjs/router` `dist/data/query.js`, `query.set`
