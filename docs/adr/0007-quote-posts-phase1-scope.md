# 0007: Whether quote posts are in the Phase 1 status card scope

- Status: accepted
- Date: 2026-07-13 (drafted 2026-07-05, deferred at the 2026-07-07 kickoff)

## Context

Akkoma statuses carry dedicated quote fields — `quote` (the quoted status,
fully nested), `quote_id`, and `akkoma.quote_apid` — so rendering quotes does
not depend on URL heuristics. The Phase 1 status card scope in PLAN did not
mention quotes; a quoted status rendered as an inline mini-card is meaningful
reading context, but it adds a recursive rendering concern (quote-of-quote
depth, missing/unfetchable quoted status) to the MVP card.

The open question from the draft — whether the quoted status is also
referenced inside the content HTML — was settled by measurement against a
real quote post on the reference instance (2026-07-13):

- Akkoma appends `<span class="quote-inline"><br/><br/>RE: <a href="…">…</a></span>`
  to the rendered `content` at serve time; the author's source
  (`akkoma.source.content`) does not contain it. The plain-text
  `pleroma.content` map carries the same duplicated URL.
- `quote` nests the full quoted status one level deep; the nested status's
  own quote fields were `null` in the sample. A redundant `quoted_status`
  self-copy exists only inside the nested object — `quote`/`quote_id` are the
  fields to trust.
- No `quote_visible`-style flag exists; presence of `quote`/`quote_id` is the
  signal.

## Decision

Quote posts are **in** the Phase 1 status card scope, rendered at depth 1:

- When `quote` is non-null, render it as a mini-card below the body block
  (the slot the wireframe reserves) and strip `span.quote-inline` from the
  body HTML so the URL is not shown twice.
- Depth is cut at 1: the mini-card does not render its own quote card and
  does not strip `quote-inline`, so deeper quotes degrade gracefully to the
  server-provided "RE:" link.
- When `quote` is null (e.g. the quoted status is remote and unfetched),
  render the body as-is; the "RE:" link remains as the natural fallback,
  consistent with ADR-0011's treatment of unresolvable references.

The recursive-rendering concern that kept this ADR deferred is resolved by
the depth-1 cut, and measurement showed the implementation cost is small
(one nested render plus one span removal in the existing HTML pipeline).

## Consequences

- The HTML pipeline (ADR-0013) must strip `span.quote-inline` exactly when a
  quote card is rendered alongside the body, and leave it intact otherwise.
- The shape of a quote whose target is remote or unfetchable is still
  unverified (the sample was a local self-quote); the null-fallback path must
  not assume any particular shape beyond `quote: null`.

## References

- Wireframe: [status-card-20260705.html](../design/status-card-20260705.html)
- Measurement: a real quote post on the reference instance (2026-07-13
  session discussion)
- ADR-0011 (unresolvable references get a secondary external link)
- ADR-0013 (HTML pipeline that implements the stripping)
