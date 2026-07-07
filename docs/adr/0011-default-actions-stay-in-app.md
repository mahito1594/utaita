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
