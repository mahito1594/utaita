# 0013: Sanitize status HTML with DOMPurify in a fragment pipeline

- Status: accepted
- Date: 2026-07-13

## Context

`status.content` is HTML rendered server-side, but timelines carry posts
authored on arbitrary remote instances; trusting the local instance's
scrubber as the only defense (as the Phase 0 card did with a raw `innerHTML`,
and as pleroma-fe and Phanpy do) puts the entire XSS surface on a component
we don't control. The card also needs three transformations the server does
not do for us: custom emoji arrive as literal `:shortcode:` text (measured
2026-07-13 — the client must replace them using `status.emojis`), the
server-appended `span.quote-inline` "RE:" link must be stripped when a quote
card is rendered (ADR-0007), and mentions must navigate in-app (ADR-0011).

Alternatives considered and rejected:

- **Browser Sanitizer API (`Element.setHTML`)**: in the WHATWG spec and
  shipped in Chrome ~145+ / Firefox 148+, but Safari has not started
  implementing it (support statement only, 2023) and it is explicitly not
  Baseline. The dogfooding target includes mobile WebKit, and happy-dom
  tests would need a JS implementation anyway.
- **Elk-style AST pipeline** (parse to an AST, emit router-aware
  components): cleaner for hover cards and rich link components, but it adds
  a parser dependency and a second rendering path for content that is static
  per status. YAGNI; the fragment approach below can migrate to it if those
  features ever materialize.
- **Hand-written ALLOWED_TAGS allowlist**: rejected because the story's
  acceptance criterion is rendering basic tags (`<small>`, `<sub>`, `<ruby>`,
  …) that pleroma-fe drops; an enumerated allowlist silently loses whatever
  Akkoma's scrubber emits next. DOMPurify's default safe set plus a small
  FORBID list inverts the failure mode: new benign tags pass, and the
  forbidden media/embedding tags stay out.

## Decision

Add **DOMPurify** as a dependency and build the card body through a single
real-DOM fragment pipeline (the Phanpy shape, plus the sanitize step Phanpy
omits):

1. `DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: [
   "img", "picture", "video", "audio", "iframe", "form", "input", "style" ] })`
   — default allowlist, forbidding only media/embedding tags. Body-authored
   images are disallowed because the emoji `<img>` elements are inserted by
   us *after* sanitization.
2. Walk the fragment (TreeWalker): replace `:shortcode:` in text nodes
   (skipping `code`/`pre`) with emoji `<img>` elements from `status.emojis`,
   strip `span.quote-inline` when a quote card is rendered (ADR-0007), and
   give non-mention links `target="_blank" rel="noopener noreferrer"`.
3. The Solid component inserts the fragment via a ref and handles mention
   clicks with a single delegated listener that calls `navigate()` — content
   is static per status, so no reactivity is lost.

The walk logic is a pure function (`DocumentFragment` in, transformed
fragment out) per the functional-core rule, tested thickly under **jsdom**:
DOMPurify silently degrades to a no-op under happy-dom (`isSupported`
reports true but `<script>`/`onclick` survive; verified 2026-07-13 with
happy-dom 20.10.6 + dompurify 3.4.12), so the pipeline tests opt into jsdom
per-file while page-level tests stay on happy-dom (ADR-0009).

Alongside this, the **`blurhash`** package (Wolt's reference implementation,
zero-dependency, API stable across years) is added for sensitive-media
previews; decoding base83 + inverse DCT by hand is bug surface with no
upside. This is recorded here rather than in its own ADR because it is a
leaf utility, not an architectural direction.

## Consequences

- Two new runtime dependencies (`dompurify`, `blurhash`); both are
  low-churn, widely-deployed libraries consistent with the
  longevity-over-novelty heuristic.
- The client no longer assumes instance-side sanitization is sufficient; the
  Phase 0 "trust as-is" comment in `StatusCard.tsx` is retired.
- If Safari ships the Sanitizer API, step 1 can be swapped behind a feature
  detect without touching the walk or the components.
- Emoji replacement, quote stripping, and link decoration live in one place;
  any future content transformation (e.g. hashtag links) joins the same
  walk instead of growing a second pass.

## References

- ADR-0007 (quote scope; defines when `quote-inline` is stripped)
- ADR-0011 (mentions navigate in-app; external links open in new tabs)
- Survey of pleroma-fe / Elk / Phanpy content pipelines and Sanitizer API
  browser status (2026-07-13 session discussion)
- Measurement: custom emoji arrive unreplaced in `content` (verified against
  the reference instance, 2026-07-13)
