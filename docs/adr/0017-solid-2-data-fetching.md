# 0017: Route data on Solid 2 — async memos, a pending row on param switches, no held updates

- Status: accepted
- Date: 2026-11-21

## Context

Solid 2 (solid-js 2.0, @solidjs/web) and @solidjs/router 2.0 went stable in
November 2026. Solid 1 and 2 cannot share an app, so the move is one switch,
and it was made as a behavior-preserving migration: the page-level suites
(ADR-0009) are the specification, and UX changes wait for their own story.

Two records name primitives that no longer exist. ADR-0004 chose `query()` +
`createAsync` for entity fetches, and ADR-0014 applied it to the thread view.
Router 2 removes `createAsync`; an async `createMemo` over the same `query()`
is its replacement. Solid 2 also changes what happens while such a memo is
pending. A read of a pending value suspends to the nearest `<Loading>`
boundary, and by default an already-rendered boundary *holds* its old content
until the new value arrives, instead of falling back. On this app's routes
that means: open another account from a profile, and the previous account
stays on screen under the new URL until the new one loads.

Router 2 also restores scroll on its own (on by default with the browser
history). After a back/forward it restores `window.scrollY` once the
navigation settles, and a `<Loading>` boundary created by the navigation
settles it as soon as its fallback is shown.

## Decision

**Entity fetches are async memos over `query()`.** `createMemo(() =>
profileQuery(acct))` and the equivalents for threads and who-lists replace
`createAsync`. `query()`, route `preload` and `revalidate()` are unchanged, and
the answer is still a `Result` (ADR-0008), so the one `<Errored>` boundary in
the layout stays the only one. Under `createAsync` the pages paired each
answer with the param it was fetched for and discarded one that belonged to a
previous param; that pairing is removed, because a param change re-runs the
memo and its pending state is what the page shows.

**A param switch on a mounted page shows the page's own loading row; Solid 2's
held update is not adopted.** ProfilePage keeps its header and replaces the
body with "Loading profile…" while `isPending(() => acct())` is true;
ThreadPage keeps its header and hides the conversation being left while
`isPending(() => params.id)` is true. Holding the
previous account or conversation under the new URL is exactly what the
existing suites forbid ("does not leave the previous conversation under the
URL of one that failed"). Whether held updates read better in practice is a
UX question for dogfooding, not part of the migration.

**The row is a `<Show>` on `isPending`, not a page-level `<Loading on={key}>`.**
A `<Loading>` mounted with the page is a fresh boundary: it shows its fallback
and lets the navigation settle, so on a back to the profile the router
restored scroll against a page that was only the fallback row, and the reader
landed at the top (reproduced against the reference instance, 2026-11-21).
Without a boundary
of its own, the page's first pending read falls to the layout's
already-rendered `<Loading>`, which holds the navigation until the content
exists; restoration then lands on the rendered list. `isPending` reads the
param rather than the answer so that a retry's revalidation of the same key
does not blank the page.

**Router 2's own mechanics replace three statements in ADR-0004's
amendments.**

- Scroll restoration is the router's default, not `<Router
  scrollRestoration>`. What it restores, and when, is unchanged: the
  document's offset, on pop only.
- Retention still tells push from pop through `useBeforeLeave`. `navigate`
  confirms a push or replace with a string target (`navigatorFactory` in
  @solidjs/router 2.0.1's `dist/routing.js`; ADR-0004 names its 1.x
  counterpart `navigateFromRoute`). The browser history confirms a
  back/forward with the numeric delta, but only when the delta is known, and
  skips the confirm otherwise (`notifyIfNotBlocked` in the same package's
  `dist/routers/history.js`). A memory history
  never confirms. "No push was announced for the landing path" still means a
  pop, and an unknown delta still falls on the safe side.
- Path params arrive decoded. Under 1.x the profile route decoded `:acct`
  itself, because the segment came over still percent-encoded; route code now
  uses the param as given, and the decode helper is gone.

## Consequences

- Every pending read on a route either belongs to a boundary rendered before
  the navigation or is gated by `isPending`; a new fresh `<Loading>` on a
  route that is returned to by back/forward is a scroll-restoration bug. Two
  remain and are known: PinnedPosts' strip, and WhoListsPage's page-level
  boundary. A back into a who-list has not been checked for an early restore.
- The supersessions are partial. ADR-0004's decision (router primitives, no
  solid-query, hand-rolled pagination) and ADR-0014's (one subject, data
  through the router's layer) stand. Only the `createAsync` mechanism and the
  amendment statements listed above change; ADR-0004, ADR-0014 and ADR-0009
  each carry a note pointing here.
- Solid 2's deferred writes (a setter's value is read back only after the
  next flush) reach the stores. The timeline's older-page queue and the cursor
  list's in-flight guard keep plain-variable mirrors for decisions made in the
  same tick as the write.
- Testing (ADR-0009): `@solidjs/testing-library` is on `1.0.0-rc.2` until a
  stable 1.0 ships. The `resolve.conditions` consequence in ADR-0009 no longer
  applies, because `@solidjs/vite-plugin` adds the conditions itself in test
  mode. `vitest.config.ts` must not set `environment: "node"` explicitly,
  because the plugin reads it as a server-only setup.

## References

- Solid 2 migration guides: https://docs.solidjs.com/migration/from-solid-1,
  https://docs.solidjs.com/migration/from-solid-router,
  https://docs.solidjs.com/migration/data-fetching-from-solid-1
- Solid testing guide: https://docs.solidjs.com/guides/testing
- [ADR-0004](./0004-data-fetching.md) — the data primitives and retention
  this record updates
- [ADR-0014](./0014-thread-view.md) — the thread view's fetch, on the same
  primitives
- [ADR-0009](./0009-testing-strategy.md) — the suites used as the migration's
  specification
