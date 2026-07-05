# 0007: Whether quote posts are in the Phase 1 status card scope

- Status: draft
- Date: 2026-07-05

## Context

Akkoma statuses carry `quote` and `quote_id` fields (verified against real
posts on the reference instance, 2026-07-05). The Phase 1 status card scope in
PLAN does not mention quotes; a quoted status rendered as an inline mini-card
is meaningful reading context, but it adds a recursive rendering concern
(quote-of-quote depth, missing/unfetchable quoted status) to the MVP card.

The status card wireframe
([status-card-20260705.html](../design/status-card-20260705.html)) reserves a
slot for the quote block below the body+media block, so adding it later does
not reshuffle the card.

## Decision

Deferred to the Phase 1 kickoff (story curation).

## Consequences

- If excluded from Phase 1, a quote post renders as its body text only.
  Whether the quoted status is also referenced inside the content HTML is
  unverified — no quote post was available on the reference instance at the
  time of writing. Verify with a real quote post before deciding.

## References

- Wireframe: [status-card-20260705.html](../design/status-card-20260705.html)
