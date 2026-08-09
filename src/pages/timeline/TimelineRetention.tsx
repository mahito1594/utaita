import {
  createContext,
  createRenderEffect,
  type ParentProps,
  useContext,
} from "solid-js";
import type { TimelineSnapshot } from "./timeline-store";

/**
 * What a timeline page holds for as long as it is mounted: the content the
 * slot was keeping for its path (undefined when the slot is empty or holds
 * another timeline), and the channel to hand its own content back on the
 * way out.
 */
export type TimelineSlotClaim = {
  readonly restored: TimelineSnapshot | undefined;
  readonly retain: (snapshot: TimelineSnapshot) => void;
};

type RetentionSlot = {
  claim: (path: string) => TimelineSlotClaim;
};

// Every timeline route is mounted under the provider today; the no-op
// default only decides how a hypothetical provider-less one would fail — it
// degrades to a page that always fetches from the top, never throws.
const RetentionSlotContext = createContext<RetentionSlot>({
  claim: () => ({ restored: undefined, retain: () => {} }),
});

/**
 * Called by a timeline page during setup, before it builds its store: the
 * claim decides whether that store resumes or fetches its first page.
 */
export const claimTimelineSlot = (path: string): TimelineSlotClaim =>
  useContext(RetentionSlotContext).claim(path);

type HeldTimeline = {
  readonly path: string;
  snapshot: TimelineSnapshot | undefined;
};

/**
 * Pathless layout route holding the reading position of one timeline across
 * an excursion into a detail route below it (docs/adr/0004-data-fetching.md).
 *
 * What it keeps is a snapshot — statuses by reference plus the `exhausted`
 * verdict — and never a live store. `createTimelineStore` builds memos, and a
 * memo belongs to the owner active when it is created; a store built lazily
 * from inside a page would be owned by that page and freeze the moment the
 * page is disposed, leaving the next one reading a dead `loadingOlder` and
 * firing older-fetches against a gate that can no longer close.
 *
 * Exactly one slot, not a map keyed by path. A tab switch is a push
 * navigation, so `<Router scrollRestoration>` restores nothing for it; a map
 * would answer such a switch with old content, scrolled to the top, and no
 * fetch — strictly worse than the refetch it replaced. With a single slot
 * that state cannot arise: switching tabs replaces the slot, and only a
 * return to the timeline that owns it resumes.
 *
 * `signedIn` is the session as the caller sees it, not something read from
 * storage here: `src/pages` does not depend on `src/app` (see
 * .dependency-cruiser.cjs).
 */
export const TimelineRetention = (
  props: ParentProps<{ signedIn: boolean }>,
) => {
  // Deliberately not a signal: the snapshot is read once, when a page builds
  // its store, and written once, when that page goes away. Reactive storage
  // would let a mounted page re-render from content it no longer owns.
  let held: HeldTimeline | undefined;

  // Dropping the slot is explicit rather than a consequence of this component
  // being disposed. The gate above it is a non-keyed `<Show>`: widen its
  // condition (to let public routes render signed-out, say) and signing out
  // becomes a truthy→truthy transition that disposes nothing, silently
  // carrying one reader's timeline into the next session. A render effect, so
  // the reset settles in the same pure phase the routes below are recreated
  // in — a post-render effect could run after the next page has claimed.
  createRenderEffect(() => {
    if (!props.signedIn) held = undefined;
  });

  const claim = (path: string): TimelineSlotClaim => {
    const restored = held?.path === path ? held.snapshot : undefined;
    const claimed: HeldTimeline = { path, snapshot: restored };
    held = claimed;
    return {
      restored,
      retain: (snapshot) => {
        // Identity-checked, like the shell's controls withdrawal: the router
        // may well create the next page before disposing this one, and a
        // departing page must never write over the slot its successor has
        // already claimed — that is how a tab switch would come to resume
        // stale content instead of fetching.
        if (held !== claimed) return;
        // An empty snapshot is not a reading position, and resuming from one
        // would strand the page: the store would consider its first load
        // already done and settle on the empty-success row with no fetch
        // coming. Failed and still-loading pages leave the slot as it was.
        if (snapshot.segments.length === 0) return;
        claimed.snapshot = snapshot;
      },
    };
  };

  return (
    <RetentionSlotContext.Provider value={{ claim }}>
      {props.children}
    </RetentionSlotContext.Provider>
  );
};
