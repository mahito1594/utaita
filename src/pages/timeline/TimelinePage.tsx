import RotateCw from "lucide-solid/icons/rotate-cw";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { gapBoundariesByTailId } from "./gap-lookup";
import { createTimelineStore } from "./timeline-store";

const errorBox = css({
  bg: "error.subtle",
  color: "error.default",
  borderWidth: "1px",
  borderColor: "error.default",
  borderRadius: "lg",
  p: "3",
  fontSize: "sm",
});

// Errors are ordinary render branches, not exceptions (ADR-0008): a 401 is
// the timeline's normal answer until auth exists, and a network failure is
// everyday weather on mobile. This is the full-page rendering for the
// initial load only — the store still has no content to fall back to.
const TimelineError = (props: { error: ApiError; onRetry: () => void }) => {
  // Non-reactive switch on purpose — but only sound because the page's
  // <Show keyed> recreates this component whenever the error *value*
  // changes. A non-keyed <Show> re-renders children only on falsy↔truthy
  // flips (Solid's condition memo compares `!a === !b`), which left a
  // network error's Retry on screen after a retry came back 403
  // (dual-review finding).
  switch (props.error.kind) {
    case "http":
      // Akkoma's unauthenticated answer differs per endpoint: home responds
      // 403 "Invalid credentials.", public responds 401 — both mean "no
      // valid user", so both get the sign-in prompt.
      return props.error.status === 401 || props.error.status === 403 ? (
        <p class={errorBox} role="alert">
          Sign-in required to view this timeline.
        </p>
      ) : (
        <p class={errorBox} role="alert">
          Request failed ({props.error.status}
          {props.error.message ? `: ${props.error.message}` : ""}).
        </p>
      );
    case "network":
      return (
        <p class={errorBox} role="alert">
          Connection failed — check your network.{" "}
          <button
            type="button"
            class={css({
              px: "3",
              py: "1",
              fontSize: "sm",
              borderWidth: "1px",
              borderColor: "error.default",
              borderRadius: "md",
              bg: "bg.surface",
              cursor: "pointer",
              _hover: { bg: "bg.subtle" },
            })}
            onClick={props.onRetry}
          >
            Retry
          </button>
        </p>
      );
  }
};

// A forward-fetch failure while the store already holds content (a refresh
// gone wrong) must not blank the timeline out from under the reader — it
// surfaces as a small notice above the existing cards instead.
const RefreshError = (props: { error: ApiError }) => (
  <p
    role="alert"
    class={css({
      bg: "error.subtle",
      color: "error.default",
      borderRadius: "md",
      p: "2",
      fontSize: "sm",
    })}
  >
    {props.error.kind === "network"
      ? "Refresh failed — check your network."
      : `Refresh failed (${props.error.status}).`}
  </p>
);

// Shared by the gap marker and the sentinel: both surface a `loadOlder`
// failure the same way, just anchored at a different spot in the list.
const olderErrorMessage = (error: ApiError): string =>
  error.kind === "network"
    ? "Couldn't load more — check your network."
    : `Couldn't load more (${error.status}).`;

const inlineErrorRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  color: "error.default",
  fontSize: "sm",
  py: "2",
});

const OlderError = (props: { error: ApiError; onRetry: () => void }) => (
  <p role="alert" class={inlineErrorRow}>
    {olderErrorMessage(props.error)}
    <button
      type="button"
      onClick={props.onRetry}
      class={css({
        px: "3",
        py: "1",
        fontSize: "sm",
        borderWidth: "1px",
        borderColor: "error.default",
        borderRadius: "md",
        bg: "bg.surface",
        cursor: "pointer",
        _hover: { bg: "bg.subtle" },
      })}
    >
      Retry
    </button>
  </p>
);

const gapRow = css({
  display: "flex",
  justifyContent: "center",
  py: "2",
  // Never a scroll-anchor candidate (plan doc, "スクロール位置が末尾ロード後
  // に最下端へ飛ぶ"): this row is created/destroyed as gaps open and close,
  // so anchoring to it would slide the viewport. Anchoring should always
  // land on a card, whose DOM the flat `<For>` below keeps stable.
  overflowAnchor: "none",
});

const gapButton = css({
  px: "3",
  py: "1",
  fontSize: "sm",
  borderWidth: "1px",
  borderColor: "border.default",
  borderRadius: "md",
  bg: "bg.surface",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { color: "text.muted", cursor: "default" },
});

// Sits at a segment boundary (a gap by definition, per the store's segment
// model — no separate gap type). Clicking it fills the gap by extending the
// *newer* segment's tail (`loadOlder(segmentIndex)`); once the fetch reaches
// the older segment, `appendOlder` merges the two and this row's segment
// boundary — and so this row itself — disappears.
const GapMarker = (props: {
  loading: boolean;
  error: ApiError | undefined;
  onFill: () => void;
}) => (
  <div class={gapRow}>
    <Show
      when={props.error}
      fallback={
        <button
          type="button"
          class={gapButton}
          disabled={props.loading}
          onClick={props.onFill}
        >
          {props.loading ? "Loading missed posts…" : "Load missed posts"}
        </button>
      }
    >
      {(error) => <OlderError error={error()} onRetry={props.onFill} />}
    </Show>
  </div>
);

const sentinelRow = css({
  display: "flex",
  justifyContent: "center",
  py: "2",
  // Same reasoning as `gapRow`: this row must never be picked as the
  // scroll anchor, or a tail-append would slide the viewport down by the
  // inserted page's height instead of holding still on existing cards.
  overflowAnchor: "none",
});

// Thin shim over IntersectionObserver (plan doc): visibility alone decides
// to call `props.onVisible`; the exhausted/in-flight/error guards live in
// the store's `exhausted`/`loadingOlder` accessors and the caller's
// `requestOlderAtTail` gate, not here. happy-dom's IntersectionObserver
// never actually calls back — page tests substitute a fake that captures
// this callback for manual invocation instead.
const Sentinel = (props: {
  loading: boolean;
  error: ApiError | undefined;
  onVisible: () => void;
  // Distinct from `onVisible`: the visibility path is gated (exhausted /
  // busy / failed — see `requestOlderAtTail`), while the Retry button is
  // the user explicitly overriding a failure, so it goes straight to the
  // store.
  onRetry: () => void;
}) => {
  let target: HTMLDivElement | undefined;

  onMount(() => {
    if (target === undefined) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) props.onVisible();
    });
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div ref={target} class={sentinelRow}>
      <Show when={props.error}>
        {(error) => <OlderError error={error()} onRetry={props.onRetry} />}
      </Show>
      <Show when={!props.error && props.loading}>
        <p role="status" class={css({ color: "text.muted", fontSize: "sm" })}>
          Loading more…
        </p>
      </Show>
    </div>
  );
};

// Panel enclosure (docs/design/timeline-refresh-20260719.html, decision doc
// — supersedes the flush-strip and detached-strip interim treatments): a
// flush strip under the header read as a broken second header on desktop
// (the header is viewport-wide, the strip column-wide); a detached
// card-style strip then read as an unrelated card. Containment — one
// bordered, rounded panel whose top edge is the bar — is what shows the bar
// and the list belong together. CRITICAL: never `overflow: hidden` here —
// clipping the panel would re-scope the bar's `position: sticky` away from
// the viewport (decision doc).
const panel = css({
  // Base (mobile, decision doc): the column already spans the viewport
  // width, so the panel stays invisible — no border/radius/padding — and
  // the bar alone carries the flush full-bleed treatment below, pixel
  // -identical to the pre-panel design.
  //
  // `md`, matching App.tsx's `column.maxWidth: { md: "600px" }`: the column
  // is only capped from `md` up, so "flush, full-bleed bar" and "column is
  // uncapped" are the same condition by construction — no viewport width
  // can produce a capped-but-still-flush band (dogfooding fix; a bespoke
  // 600px breakpoint synced by comment across two files was tried and
  // dropped in favor of this structural invariant).
  md: {
    borderWidth: "1px",
    borderColor: "border.default",
    // One step above the cards' `lg` (errorBox, StatusCard), matching the
    // comp's 12px — the panel is a container, not a card itself.
    borderRadius: "xl",
  },
});

// Body of the panel: the existing column gap between rows, plus the
// panel's own inset once the panel has a border to inset from. `pt` is
// unconditional so the bar→first-card gap always matches the inter-card
// gap ("3"), now that they're siblings with no shared flex `gap` between
// them (the panel restructure moved the bar outside this flex column).
// `md` sets `px`/`pb` rather than `p`, not `pt`, so it never collides with
// the base `pt` on the same property (cascade-order-dependent) — the
// effective padding is still 12px on all sides once `md` applies.
const panelBody = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  pt: "3",
  md: {
    px: "3",
    pb: "3",
  },
});

// The panel's top edge (decision doc): today it only carries the manual
// refresh control, but is the future home of the timeline switcher tabs
// too — kept as its own row rather than folded into the refresh button.
const bar = css({
  position: "sticky",
  top: "0",
  bg: "bg.surface",
  borderColor: "border.default",
  // No z-index scale in this project's tokens (only colors are governed by
  // the semantic-token rule) — a raw value just keeps the sticky bar above
  // card internals (MediaGrid, PollView) that create their own stacking
  // context.
  zIndex: "1",
  // Never a scroll-anchor candidate: see gapRow/sentinelRow — the bar is
  // sticky, not part of the scrolling content, and must not be chosen over
  // a card.
  overflowAnchor: "none",
  px: "4",
  py: "2",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  // Base (mobile): the panel above is invisible, so these negative margins
  // still have to reach past `main`'s own px-4/py-4 (App.tsx) themselves —
  // the bar's edges meet the header's flush, matching its width there.
  mx: "-4",
  mt: "-4",
  borderBottomWidth: "1px",
  // `md`+ (decision doc; see `panel` for why `md` is the right condition):
  // no more escaping to do — the panel now carries the border. The bar just
  // sits flush against the panel's own top edge, with a matching top radius
  // standing in for the `overflow: hidden` clip we deliberately don't use
  // (CRITICAL, see `panel`).
  md: {
    mx: "0",
    mt: "0",
    borderTopRadius: "xl",
  },
});

// Names the current timeline and pre-figures the future switcher tabs'
// opening position (decision doc) — static text, no state.
const homeLabel = css({
  color: "text.brand",
  fontWeight: "semibold",
  fontSize: "sm",
});

// 40px ghost icon button (decision doc): borderless, transparent until
// hovered, so it reads as part of the strip rather than a separate control.
// `aria-label` carries the accessible name so it stays "Refresh" regardless
// of the icon shown.
const refreshButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "10",
  height: "10",
  borderRadius: "md",
  bg: "transparent",
  color: "accent.default",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { color: "text.muted", cursor: "default" },
});

// Rotates while a refresh is in flight; Panda's built-in `spin` keyframe
// (bundled by the default preset-panda preset, confirmed in
// styled-system/tokens) covers it. `_motionReduce` swaps the spin for a
// static, dimmed icon instead of leaving it running (decision doc).
const refreshIconSpinning = css({
  animation: "spin",
  _motionReduce: {
    animation: "none",
    opacity: "0.5",
  },
});

const caughtUpRow = css({
  color: "text.muted",
  fontSize: "sm",
  textAlign: "center",
  py: "2",
  // See `gapRow`/`sentinelRow`: this row replaces the sentinel once
  // exhausted, and must be just as anchor-inert as the row it replaces.
  overflowAnchor: "none",
});

// SR-only announcement channel for the manual refresh outcome. Focus stays
// on the refresh button (users hitting Enter twice in a row shouldn't lose
// their place); the count of newly-loaded posts, or "no new posts", is
// spoken through this permanent aria-live region instead of by moving
// focus. Refresh *failures* stay on `RefreshError` (role="alert"), so this
// channel only carries the success/empty-success outcomes.
const visuallyHidden = css({
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  borderWidth: "0",
});

export const TimelinePage = () => {
  const store = createTimelineStore();
  const [refreshAnnouncement, setRefreshAnnouncement] = createSignal("");

  // Wraps `store.refresh()` to count net new statuses and hand the outcome
  // to the SR-only live region. Only the manual paths (bar button + retry
  // after an initial-load failure) go through this — the initial onMount
  // load doesn't announce because there is nothing to compare against yet
  // and no user action triggered it.
  //
  // The clear-then-microtask-set pattern is the a11y workaround for
  // consecutive identical announcements: Solid's default signal equality
  // suppresses re-sets of the same string, so a second "No new posts" in
  // a row would leave the DOM text unchanged and screen readers would not
  // re-announce. Clearing first, then setting on the next microtask,
  // forces the DOM text to actually transition.
  const announceRefreshOutcome = (message: string): void => {
    setRefreshAnnouncement("");
    queueMicrotask(() => setRefreshAnnouncement(message));
  };
  const runRefreshWithAnnouncement = async (): Promise<void> => {
    // The applied count comes from the store itself, not a before/after
    // total diff here: an older-fetch completing while the refresh was in
    // flight would land in a total diff and get announced as "new posts"
    // (dual-review finding). `undefined` means nothing was applied — the
    // fetch failed (RefreshError/TimelineError carry that) or another
    // refresh was already in flight — so there is no outcome to announce.
    const applied = await store.refresh();
    if (applied === undefined) return;
    announceRefreshOutcome(
      applied === 0
        ? "No new posts"
        : `${applied} new post${applied === 1 ? "" : "s"} loaded`,
    );
  };

  onMount(() => {
    void store.refresh();
  });

  // Flattened for both the "is there anything to show yet" checks and the
  // render itself: a single `<For>` keyed by Status object reference (which
  // the pure core keeps stable across updates, see segments.ts) means an
  // `appendOlder`/`applyRefresh` that replaces a *segment* wrapper no longer
  // recreates the cards inside it — the previous nested `<For each={
  // segments}>` did, which destroyed the browser's scroll-anchor candidates
  // and made the viewport jump on every tail load (plan doc, "スクロール位置
  // が末尾ロード後に最下端へ飛ぶ").
  const statuses = () =>
    store.segments().flatMap((segment) => segment.statuses);
  const lastSegmentIndex = () => store.segments().length - 1;

  // Non-last segments' tail-status id → that segment's index, recomputed
  // only when `segments()` changes (not per card) so the flat `<For>` can
  // still place a gap marker immediately after the right card.
  const gapBoundaries = createMemo(() =>
    gapBoundariesByTailId(store.segments()),
  );
  // `{ index }` rather than a bare number: `<Show when>` treats `0` as
  // falsy, which would silently hide a gap marker sitting at segment 0.
  const gapAfter = (
    statusId: string | undefined,
  ): { index: number } | undefined => {
    if (statusId === undefined) return undefined;
    const index = gapBoundaries().get(statusId);
    return index === undefined ? undefined : { index };
  };

  // The sentinel only ever targets the tail segment, so `exhausted` (a
  // tail-only verdict) is a valid gate here; a gap marker's `loadOlder(i)`
  // targets an arbitrary earlier segment and must not be blocked by it, so
  // it calls the store directly instead (below). The store's own dedup
  // (`pendingOlderAnchors.includes(anchorId)`) also absorbs re-fires, so
  // this gate is UX-level ("don't spin the sentinel when we know there's
  // nothing left") rather than a correctness backstop.
  //
  // The failure gate keeps an IntersectionObserver re-fire (any scroll
  // jiggle while the error row is on screen) from silently clearing the
  // failure and re-requesting on its own — once a Retry affordance is
  // shown, retrying is the user's call, via the Sentinel's `onRetry`
  // (dual-review finding).
  const requestOlderAtTail = () => {
    const segmentIndex = lastSegmentIndex();
    if (
      store.exhausted() ||
      store.loadingOlder(segmentIndex) ||
      store.loadOlderError(segmentIndex) !== undefined
    )
      return;
    void store.loadOlder(segmentIndex);
  };

  return (
    <div class={panel}>
      <div class={bar}>
        <span class={homeLabel}>Home</span>
        <button
          type="button"
          aria-label="Refresh"
          aria-busy={store.loading() ? "true" : undefined}
          disabled={store.loading()}
          onClick={() => void runRefreshWithAnnouncement()}
          class={refreshButton}
        >
          <RotateCw
            size={20}
            aria-hidden="true"
            {...(store.loading() ? { class: refreshIconSpinning } : {})}
          />
        </button>
      </div>

      <div class={panelBody}>
        {/* SR-only channel for manual-refresh outcomes; see `visuallyHidden`
            above. Kept permanently mounted so that updating its text
            actually announces (a newly-mounted live region does not). */}
        <p role="status" aria-live="polite" class={visuallyHidden}>
          {refreshAnnouncement()}
        </p>

        <Show when={statuses().length === 0 && store.loading()}>
          <p role="status" class={css({ color: "text.muted" })}>
            Loading…
          </p>
        </Show>

        <Show when={statuses().length === 0 && store.error()} keyed>
          {(error) => (
            <TimelineError
              error={error}
              onRetry={() => void runRefreshWithAnnouncement()}
            />
          )}
        </Show>

        <Show when={statuses().length > 0 && store.error()}>
          {(error) => <RefreshError error={error()} />}
        </Show>

        {/* Empty-success state: the fetch settled without content and
            without an error. Distinct from the loading state above and
            from the sentinel/caught-up rows below, both of which require
            at least one segment. */}
        <Show
          when={
            store.segments().length === 0 &&
            !store.loading() &&
            store.error() === undefined
          }
        >
          <p role="status" class={css({ color: "text.muted" })}>
            No posts yet.
          </p>
        </Show>

        <For each={statuses()}>
          {(status) => (
            <>
              <StatusCard status={status} />
              {/* A segment boundary *is* a gap (segment model, plan doc);
                  `gapAfter` only matches the tail id of a non-last segment —
                  the last segment's boundary is the sentinel below instead. */}
              <Show when={gapAfter(status.id)}>
                {(gap) => (
                  <GapMarker
                    loading={store.loadingOlder(gap().index)}
                    error={store.loadOlderError(gap().index)}
                    onFill={() => void store.loadOlder(gap().index)}
                  />
                )}
              </Show>
            </>
          )}
        </For>

        <Show when={store.segments().length > 0}>
          <Show
            when={!store.exhausted()}
            fallback={
              <p role="status" class={caughtUpRow}>
                You're all caught up.
              </p>
            }
          >
            <Sentinel
              loading={store.loadingOlder(lastSegmentIndex())}
              error={store.loadOlderError(lastSegmentIndex())}
              onVisible={requestOlderAtTail}
              onRetry={() => void store.loadOlder(lastSegmentIndex())}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
};
