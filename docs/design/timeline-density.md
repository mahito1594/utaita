# Timeline density — full-bleed rows over per-status cards

Decided 2026-08-11, from the first dogfooding round (findings 4, 5, and 7:
statuses feel stretched out on mobile, the horizontal padding question, and
the thread view looking right-shifted). Supersedes the card treatment in the
2026-07-05 wireframes (`status-card-20260705.html`, `app-shell-20260705.html`).

## Decision

Statuses render as full-bleed rows, not cards.

- **Timeline**: each status is a row with 12px horizontal inset and a 1px
  `border.default` bottom rule. No per-status border, radius, background, or
  list gap. The list itself becomes the `bg.surface` plane; `bg.canvas`
  (cream) stays with the app chrome around it.
- **Desktop**: the column — not the status — carries the card feel: a
  centered, max-width panel with border and radius around the whole list
  (the akkoma-fe construction).
- **QuoteCard stays a card.** A bordered, rounded mini-card inside a
  full-bleed row is the signal that the quote is foreign material, the same
  construction x.com uses.
- **Thread view**: rows get the same symmetric 12px insets. The 2px spine
  rule moves to the screen edge and lives inside the left gutter instead of
  pushing the text; the subject keeps its two-channel mark (accent spine +
  `bg.subtle` background).

## Why

- A timeline is a continuous scan over homogeneous items, not a collection
  of independent widgets. Per-status chrome (border, radius, gap) repeats
  the "this is one standalone unit" signal N times; a single hairline is
  enough to separate items. Cards earn their cost when items are
  heterogeneous (dashboards) — a feed is not that.
- Horizontal width is the scarcest resource on mobile. Card borders plus
  list gaps spend it twice before the text starts. Full-bleed is not zero
  padding: both akkoma-fe and x.com keep a ~12px text inset (legibility,
  and edge-swipe gestures) — what they drop is the per-item frame.
- Vertical arithmetic: card padding + border + gap + border + padding
  stacked ≈ 38px between bodies; row padding + rule + padding ≈ 21px.
  Roughly one extra status per phone screen.
- Measured references (2026-08-11): akkoma-fe separates statuses with a 1px
  border-bottom only, zero margin, 12px inner padding, and dissolves the
  column's card chrome entirely on mobile (effectively full-bleed at
  ≤ 45rem columns).

## Rejected

- **Keep cards, tighten spacing** — only partially relieves the density
  complaint; leaves the padding question and the thread asymmetry
  unresolved. Invites the same complaint again.
- **Full-bleed on mobile, per-status cards on desktop** — two layouts to
  maintain forever for the same payoff as one; even akkoma-fe only toggles
  column chrome, never the per-status treatment.
- **Thread without the spine (separator rules only)** — drops the subject
  mark to a single visual channel (background). Subject arrival is wired
  into focus management (`aria-current`, focus landing), so the redundancy
  is worth one extra element. The right-shift complaint was caused by the
  rule pushing the text, not by the rule existing.
