import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { outlineButton } from "../../ui/outline-button";
import { gapBoundariesByTailId } from "./gap-lookup";
import { publishTimelineControls } from "./TimelineShell";
import { createTimelineStore } from "./timeline-store";
import type { TimelineDefinition } from "./timelines";

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
  // network error's Retry on screen after a retry came back 403.
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
            class={outlineButton({ tone: "error" })}
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
      // Never a scroll-anchor candidate (ADR-0004 amendment): this row appears
      // above existing cards and vanishes on a successful refresh — anchoring to
      // it would slide the viewport.
      overflowAnchor: "none",
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

// Shared by the gap marker and the sentinel's persistent buttons; the
// recipe's `_disabled` styling covers both the click guard's semantic state
// and the retry-in-flight look (the same `aria-disabled` keying as the bar's
// refresh button in TimelineShell.tsx).
const olderRetryButton = outlineButton({ tone: "neutral" });

const gapRow = css({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: "2",
  py: "2",
  // Never a scroll-anchor candidate (ADR-0004 amendment): this row is
  // created/destroyed as gaps open and close, so anchoring to it would
  // slide the viewport. Anchoring should always land on a card, whose DOM
  // the flat `<For>` below keeps stable.
  overflowAnchor: "none",
});

// Sits at a segment boundary (a gap by definition, per the store's segment
// model — no separate gap type). Clicking it fills the gap by extending the
// *newer* segment's tail (`loadOlder(segmentIndex)`); once the fetch reaches
// the older segment, `appendOlder` merges the two and this row's segment
// boundary — and so this row itself — disappears.
//
// One persistent `<button>` across idle/loading/error, not a `<Show>`
// swapping elements: the store clears a failure synchronously as a Retry
// click dispatches, so an element swap would remove the clicked button and
// drop keyboard focus to `<body>`. `aria-disabled` + no-op guard is the
// same pattern as the refresh button in TimelineShell.tsx.
const GapMarker = (props: {
  loading: boolean;
  error: ApiError | undefined;
  onFill: () => void;
}) => {
  const handleClick = () => {
    if (props.loading) return;
    props.onFill();
  };

  return (
    <div class={gapRow}>
      <Show when={props.error}>
        {(error) => (
          <span
            role="alert"
            class={css({ color: "error.default", fontSize: "sm" })}
          >
            {olderErrorMessage(error())}
          </span>
        )}
      </Show>
      <button
        type="button"
        class={olderRetryButton}
        aria-disabled={props.loading ? "true" : undefined}
        onClick={handleClick}
      >
        {props.error !== undefined
          ? "Retry"
          : props.loading
            ? "Loading missed posts…"
            : "Load missed posts"}
      </button>
    </div>
  );
};

const sentinelRow = css({
  display: "flex",
  justifyContent: "center",
  py: "2",
  // Same reasoning as `gapRow`: this row must never be picked as the
  // scroll anchor, or a tail-append would slide the viewport down by the
  // inserted page's height instead of holding still on existing cards.
  overflowAnchor: "none",
});

// Thin shim over IntersectionObserver: visibility alone decides to call
// `props.onVisible`; the exhausted/in-flight/error guards live in
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

  // Keeps the error row (and its Retry button) mounted through a retry
  // cycle. `props.error` goes briefly undefined the instant Retry
  // dispatches — `fetchOlderFor` clears the segment's failure synchronously,
  // before the fetch even starts (timeline-store.ts) — so gating the row on
  // `props.error` alone would swap it out for the plain "Loading more…" row
  // mid-click and drop focus to `<body>`. `retrying` bridges that gap.
  const [retrying, setRetrying] = createSignal(false);

  // `defer: true`: only `loading`'s own transitions clear `retrying`, not
  // the effect's first run — without it, the mount-time baseline (`loading`
  // already settled to whatever it was) would immediately clear a
  // `retrying` the click just set.
  createEffect(
    on(
      () => props.loading,
      (loading) => {
        if (!loading) setRetrying(false);
      },
      { defer: true },
    ),
  );

  const handleRetryClick = () => {
    if (props.loading) return;
    setRetrying(true);
    props.onRetry();
  };

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
      <Show when={props.error !== undefined || retrying()}>
        <p
          role={props.error === undefined ? undefined : "alert"}
          class={inlineErrorRow}
        >
          <Show when={props.error}>
            {(error) => olderErrorMessage(error())}
          </Show>
          <button
            type="button"
            class={olderRetryButton}
            aria-disabled={props.loading ? "true" : undefined}
            onClick={handleRetryClick}
          >
            {props.loading ? "Retrying…" : "Retry"}
          </button>
        </p>
      </Show>
      <Show when={props.error === undefined && !retrying() && props.loading}>
        <p role="status" class={css({ color: "text.muted", fontSize: "sm" })}>
          Loading more…
        </p>
      </Show>
    </div>
  );
};

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
// on the shell's refresh button (users hitting Enter twice in a row
// shouldn't lose their place); the count of newly-loaded posts, or "no new
// posts", is spoken through this aria-live region instead of by moving
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

export const TimelinePage = (props: { timeline: TimelineDefinition }) => {
  const store = createTimelineStore(props.timeline.fetchPage);
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
    // flight would land in a total diff and get announced as "new posts".
    // `undefined` means nothing was applied — the
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

  // The bar's refresh control belongs to TimelineShell, which outlives this
  // page across a tab switch — this hands it the store it should be driving
  // for as long as this page is the one mounted.
  publishTimelineControls({
    loading: store.loading,
    refresh: () => void runRefreshWithAnnouncement(),
  });

  onMount(() => {
    void store.loadInitial();
  });

  // Flattened for both the "is there anything to show yet" checks and the
  // render itself: a single `<For>` keyed by Status object reference (which
  // the pure core keeps stable across updates, see segments.ts) means an
  // `appendOlder`/`applyRefresh` that replaces a *segment* wrapper no longer
  // recreates the cards inside it — the previous nested `<For each={
  // segments}>` did, which destroyed the browser's scroll-anchor candidates
  // and made the viewport jump on every tail load (ADR-0004 amendment).
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
  // shown, retrying is the user's call, via the Sentinel's `onRetry`.
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
    <>
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
            {/* A segment boundary *is* a gap (segment model — segments.ts,
                  ADR-0004 amendment); `gapAfter` only matches the tail id of
                  a non-last segment — the last segment's boundary is the
                  sentinel below instead. */}
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
    </>
  );
};
