# Design tokens — rationale

2026-07-06. The tokens themselves live in [`panda.config.ts`](../../panda.config.ts);
this file records why they are what they are.

## Palette origin

The five anchor colors come from a pre-existing personal palette (Coolors
export) that the author uses across their apps and services — chosen for
identity continuity, not derived from the Phase 0 wireframes. The colors that
appear in `app-shell-20260705.html` / `status-card-20260705.html` were
incidental mock styling and carry no decision weight.

| Anchor | Hex | Role |
| --- | --- | --- |
| chocolate-cosmos | `#451722` | deep emphasis / brand (`text.brand`) |
| dun | `#C9BEA3` | warm sand — parent of the derived surface ramp |
| white | `#FFFFFF` | card surface (`bg.surface`) |
| jet | `#333333` | body text (`text.default`) |
| amaranth-purple | `#A02C3F` | accent (`accent.default`) |

## Light theme only

Decided 2026-07-06: no dark mode. This is a personal-use client; maintaining a
second color face costs more than it returns. Consequences:

- Semantic tokens keep role names (`bg.*`, `text.*`, …) so a dark face could
  be added later as `_dark` values without touching consumers — but no `_dark`
  values are written.
- `globalCss` declares `color-scheme: light` so native widgets (form controls,
  scrollbars) stay light even when the OS prefers dark.
- The Phase 1 "theme toggle" story was dropped (stories.md).

## Contrast verification (WCAG 2.x relative luminance)

Anchor pairs, verified 2026-07-06:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| jet on white | 12.6:1 | AAA |
| jet on dun | 6.9:1 | AA |
| amaranth on white | 7.2:1 | AAA — usable as link color |
| white on amaranth | 7.2:1 | AAA — filled buttons OK |
| chocolate-cosmos on white | 15.0:1 | AAA |
| **amaranth on dun** | **3.9:1** | **large elements only** |

Standing constraint: amaranth on dun-family surfaces is reserved for large
elements (buttons, icons ≥ 3:1); never small link text on sand backgrounds.

## Derived shades

The anchors are an identity palette, not a UI palette; the in-between shades
were derived by mixing along white→dun (surfaces) and jet→dun (muted text),
then contrast-checked:

| Token | Hex | Derivation | Checked |
| --- | --- | --- | --- |
| `cream.50` | `#FAF8F3` | white→dun, page canvas | surface only |
| `cream.100` | `#F2EEE3` | white→dun, subtle bg / hover | jet on it: 10.9:1 |
| `cream.200` | `#E3DCC9` | white→dun, borders | non-text |
| `taupe` | `#6B6558` | jet→dun, muted text | 5.8:1 on white, 5.0:1 on cream.100 |
| `amaranth.deep` | `#8A2536` | darkened amaranth, hover | 8.8:1 on white |

## Error color: a separate hue

Decided 2026-07-06: the accent is already red, so errors get their own hue to
stay distinguishable at a glance. Burnt sienna, adjacent to the palette's warm
tone but clearly not amaranth:

| Token | Hex | Checked |
| --- | --- | --- |
| `sienna` | `#A0490F` | 6.1:1 on white, 5.2:1 on `sienna.pale` |
| `sienna.pale` | `#FBEADD` | error-banner background |

## Everything else

- Spacing, radii, and the type scale ride on Panda's preset tokens; nothing is
  overridden until a real screen demands it.
- Font is the `sans` preset stack (system-ui). Static-file distribution means
  no webfont hosting, and Japanese text falls to system fonts anyway.
- Semantic token set is intentionally minimal (`bg.canvas/surface/subtle`,
  `text.default/muted/brand/onAccent`, `accent.default/hover`,
  `border.default`, `error.default/subtle`); new names are added when a
  consumer demands them, per the rule of three.
