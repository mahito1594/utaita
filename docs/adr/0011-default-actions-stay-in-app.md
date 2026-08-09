# 0011: Default tap actions never leave the app

- Status: accepted
- Date: 2026-07-07

## Context

A recurring pleroma-fe frustration: tapping something in a thread or timeline
silently opens another instance's page in a new browser tab (a separate
browser on mobile), losing the reading context. Remote content makes this
easy to hit by accident — unfetched thread parents, mentions, and pasted
status URLs all point off-instance.

## Decision

Default tap/click actions never navigate outside the app. External
navigation happens only through affordances explicitly marked as external
(e.g. "open original ↗"). Concretely for Phase 1:

- Unfetched thread parents (`in_reply_to_id: "_"`, real parent in
  `akkoma.in_reply_to_apid`) are ingested server-side via `/api/v2/search`
  with `resolve=true` and rendered in-app. Only when resolution fails
  (deleted, private, blocked instance) does the thread show a placeholder,
  with an explicitly-marked external link as a secondary affordance — never
  as the placeholder's default tap action.
- Mentions in status HTML navigate to the in-app profile page.
- Plain URLs in status bodies are ordinary links and may open externally in
  a new tab — a link is an explicit affordance by itself. In-app resolution
  of fediverse status URLs found in bodies was considered and iceboxed:
  there is no reliable way to tell a status URL from any other URL before
  fetching it, unlike thread parents which carry `in_reply_to_apid`.

## Consequences

- The thread view depends on an authenticated resolve call, so it can only
  be built after OAuth login (Phase 1 session 1).
- Whether Akkoma's resolve backfills a whole ancestor chain or one status
  per call is unverified; measure at implementation time and iterate the
  resolve if needed.
- Quote posts are unaffected: the quoted status arrives structurally in the
  `quote` field, so rendering it in-app needs no URL handling (ADR-0007).

## References

- Kickoff discussion, 2026-07-07 (outcome recorded here and in
  [stories.ja.md](../stories.ja.md))

## Amendment (2026-08-09): ingesting a parent is an action, not a rendering

Built at Phase 1 session 7 ([ADR-0014](./0014-thread-view.md)). The intent —
a default tap never sends the reader out of the app — is unchanged. The first
bullet of the Decision above described a Phase 1 shape that measurement has
overturned, and is superseded here.

- **The placeholder appears whenever the parent is un-ingested, not only when
  resolution fails.** Resolution no longer happens on the way to the
  placeholder; the placeholder is what carries the action that starts it.
- **Nothing resolves automatically, anywhere.** Three reasons, in the order
  they were established. A resolve measured 2649 ms and 2667 ms against the
  reference instance, which is not a wait to spend without asking. It is a
  write to the instance's database and a request to a stranger's server, so
  a view that started one by rendering would commit the instance to outward
  side effects the reader never asked for — and a 40-status timeline page
  would commit it to forty. And `/api/v2/search` is a search: when it cannot
  obtain the object it falls back to full-text hits for the AP id *as a
  plain string* (`do_search` in Akkoma's `database_search.ex`), so a post
  that merely links to the parent can come back in its place. An automatic
  resolve could therefore show the wrong post silently. The client rejects a
  result whose `uri` is not the id it asked for.
- **The external link sits beside the action from the start, not after a
  failure.** What this record rules out is external navigation as the
  *default* action; a marked secondary link next to the primary button is
  not that. Hiding it until failure would charge the reader 2.6 s to
  discover that an escape hatch exists.
- Unchanged: mentions go to the in-app profile, plain body URLs remain
  ordinary external links, and quote posts need no URL handling.
