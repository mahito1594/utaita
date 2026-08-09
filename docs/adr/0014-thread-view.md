# 0014: Thread view — one subject, no indentation, arrival-aware scrolling

- Status: accepted
- Date: 2026-08-09

## Context

Reading replies was the last thing that still forced pleroma-fe open, and
Phase 1's done condition is a day of reading without it. A conversation view
raises four questions that outlive the screen itself: what a thread is
*about*, how its shape is drawn, where the data comes from, and who owns the
scroll offset when the reader moves between the timeline and a conversation.

Two measurements on the reference instance shaped the answers. Akkoma's
`/api/v1/statuses/:id/context` splits the conversation into `ancestors` and
`descendants` by local insertion order, so a parent ingested after its child
comes back under `descendants` (reproduced 2/2). And flake ids are insertion
order too, so lexicographic order matches chronology only for statuses that
arrived through a timeline — not for thread content backfilled later. Both
are recorded under the Akkoma pitfalls in [PLAN.ja.md](../PLAN.ja.md).

## Decision

**A thread is about exactly one status — the subject — and digging re-roots
it.** Opening a reply from inside a conversation navigates to that reply's
own thread, where the post you came from becomes one row of the ancestor
chain. There is no second kind of focus and no in-place expansion, so the URL
is the whole of the view's state and any position in the conversation is
shareable.

**The context's own split is ignored.** `ancestors`, `descendants` and the
subject are merged into one set and the tree is re-derived from
`in_reply_to_id` alone; siblings are ordered by `created_at`, never by id.
Statuses that reach neither the subject nor its ancestors are not dropped —
federation loses middle posts, and silently discarding a branch is worse than
showing it under a heading that says it could not be connected.

**Replies are drawn depth-first with zero indentation** — one rule at one
offset for every row, whatever its depth. Nesting would spend width a phone
does not have and make a deep branch narrower than a shallow one; who a post
answers is already on its own card. Depth-first ordering is what carries the
structure instead: a branch reads as one uninterrupted run.

**Nothing is collapsed.** Every row the context returns is rendered. This is
a Phase 1 bet on the reference instance's actual conversations, which are
small (no status with two or more replies in 240 sampled), not a claim that
it scales.

**Fetching goes through the router's data layer** — `query()` +
`createAsync` + route `preload`, the first application of what ADR-0004
decided. The subject and its context are one cache entry, not two: ingesting
an unfetched parent rewrites the subject's own `in_reply_to_id`, so
revalidating the context alone would rebuild the tree from a stale subject.
The query returns a `Result` (ADR-0008), so Suspense receives a value and a
failed thread is cached like any other answer.

**A card-wide tap opens a status's conversation, and the timestamp carries
the permalink.** The card is not wrapped in an anchor — it contains links
already, and nesting them is invalid — so a real anchor serves the keyboard,
the screen reader and modified clicks, while one delegated handler routes a
tap anywhere else on the card through the same navigation. What keeps its own
tap is selected by element kind rather than by region, so a control leaves
the card's tap on the day it becomes a control. A standing text selection at
click time means the reader was selecting, not tapping.

**The scroll offset has two owners, and which one acts depends on how the
reader arrived.** Asking for a conversation lands on the subject; walking
back into one restores where they left it. This is not a preference — scroll
restoration abandons a restore the moment a scroll it did not make arrives,
so landing on a traversal loses the offset *and* replaces it. Two
consequences follow:

- **The way back to the timeline is a history back, not a link.** A link is a
  push, and there is nothing to restore on a push.
- **Nothing about an arrival may be read once and kept.** solid-router keys a
  route context by its route definition, so a change of `:id` alone reuses
  the context and never re-runs `preload` — the one place the router's
  `intent` is legible. The navigation that causes an arrival records it
  instead, and the page consumes that record once per `:id`.

## Consequences

- Digging into a branch is a push, so the reader accumulates history and the
  back control walks it. A thread opened from a shared link has nothing
  behind it and offers a link home instead; that determination is
  recomputed per arrival and errs only toward *not* offering a back that
  would leave the app.
- The URL shape lives in one place (`statusPath`), beside the profile
  permalink and away from the route table that consumes it.
- Collapsing, and the "who reacted / boosted / faved" lists that also belong
  to this screen, are deliberately deferred to dogfooding rather than
  designed against the small threads measured here.
- An unfetched parent is where ADR-0011's Phase 1 shape changes; see the
  amendment on that record.
- A route `preload` runs on a match regardless of what the auth gate renders,
  so a signed-out visit to a thread permalink already fetches anonymously.
  Harmless — both endpoints answer 200 anonymously and `completeLogin`
  flushes the cache — but the gate is not a fetch boundary.

## References

- Design discussion and API measurements, 2026-08-09 (Akkoma pitfalls
  recorded in [PLAN.ja.md](../PLAN.ja.md))
- [ADR-0004](./0004-data-fetching.md) — the data primitives applied here, and
  the retention this view made necessary
- [ADR-0011](./0011-default-actions-stay-in-app.md) — unfetched parents
