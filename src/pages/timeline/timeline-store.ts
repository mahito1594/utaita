import { type Accessor, createSignal } from "solid-js";
import { type ApiError, client, toResult } from "../../api/client";
import { appendOlder, applyRefresh, type Segment } from "./segments";

// Home timeline's page size is clamped to 40 server-side (measured against
// the reference instance, see ADR-0004 amendment); a page that comes back
// exactly this long cannot rule out more statuses beyond it.
const PAGE_LIMIT = 40;

export type TimelineStore = {
  segments: Accessor<readonly Segment[]>;
  // True while a forward fetch (initial load or manual refresh — same
  // request shape, see `refresh` below) is in flight.
  loading: Accessor<boolean>;
  // Last forward-fetch failure. While `segments` is empty this is the
  // initial-load error (full-page rendering); once there is content, a
  // later failure here is a refresh failure and must not clear it
  // (non-destructive per ADR-0004 amendment).
  error: Accessor<ApiError | undefined>;
  // Both `loadingOlder`/`loadOlderError` take a UI-facing segment index but
  // resolve it against the *current* segment list on every call (see
  // `anchorOf` below) — so they keep tracking the right row even if a
  // concurrent `refresh` has shifted indices while a fetch is in flight.
  //
  // `loadingOlder` reflects both the anchor currently being fetched AND any
  // queued behind it (see `pendingOlderAnchors`): the store serialises
  // older-fetches, so a segment whose fetch is queued is still "busy" from
  // the UI's point of view.
  loadingOlder: (segmentIndex: number) => boolean;
  loadOlderError: (segmentIndex: number) => ApiError | undefined;
  // True once a short (below page-limit) older-fetch proves nothing older
  // exists: judged against the post-merge segment list as the response is
  // applied (not when the request went out), so a gap fill that collapses
  // into the tail segment counts too. Sticky — the timeline only ever grows from the
  // front, so this never has reason to flip back to false.
  exhausted: Accessor<boolean>;
  // Resolves with the number of statuses this refresh actually applied
  // (post-dedup), or undefined when nothing was applied — the fetch failed
  // (see `error`) or another refresh was already in flight. The count comes
  // from the store rather than a caller-side total diff so that an
  // older-fetch completing concurrently is never blamed on the refresh
  // (the announcement layer reads this).
  refresh: () => Promise<number | undefined>;
  loadOlder: (segmentIndex: number) => Promise<void>;
};

// Imperative shell (FCIS): plain async functions call the API and hand the
// result to Unit 1's pure segment functions. No throws (ADR-0008) — every
// outcome is a `Result` value this module inspects itself. Component-scoped
// (created inside TimelinePage, not a module singleton, per ADR-0004
// amendment) so a login/logout page transition simply discards and
// recreates it.
export const createTimelineStore = (): TimelineStore => {
  const [segments, setSegments] = createSignal<readonly Segment[]>([]);
  // Starts true: the store is created by a component that always calls
  // `refresh()` on mount, and starting false would flash the empty-success
  // row for a frame before the mount effect flips it.
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<ApiError>();
  // FIFO of anchor ids (target segment's tail id, not its index — see the
  // index-shift race handling below): head = currently in flight, rest =
  // queued. A concurrent `refresh` can shift every segment's index by +1
  // while an older-fetch is in flight; anchoring by tail id keeps the
  // response landing on the right segment across that shift.
  //
  // Serialised on purpose: concurrent older-fetches would race the pure
  // `appendOlder` reducer (each response could merge segments away, moving
  // the other's target). Approach A in the review — later fetches queue
  // rather than being silently dropped; a per-anchor parallel model is
  // iceboxed in stories.ja.md pending dogfooding evidence.
  const [pendingOlderAnchors, setPendingOlderAnchors] = createSignal<
    readonly string[]
  >([]);
  // One entry per anchor that most recently failed. A single-signal design
  // was fine when only one older-fetch could be in flight, but once the
  // queue lets a *following* fetch start before the user has seen the
  // previous failure, the earlier anchor's error would be silently wiped.
  // Keeping failures per anchor lets each GapMarker/Sentinel row keep
  // showing its own retry affordance independently.
  const [loadOlderFailures, setLoadOlderFailures] = createSignal<
    readonly { anchorId: string; error: ApiError }[]
  >([]);
  const [exhausted, setExhausted] = createSignal(false);

  // Reentry guard for `refresh`. Deliberately not the `loading` signal:
  // `loading` starts true before the mount-time call on purpose (see above),
  // so it can't tell "in flight" apart from "not started yet". Without this
  // guard, the initial-error Retry could race two param-less fetches — the
  // slower response would then merge as though its page were newer than the
  // freshly-adopted head, prepending older statuses and breaking the
  // newest-first invariant (dual-review finding).
  let refreshInFlight = false;

  const countStatuses = (segs: readonly Segment[]): number =>
    segs.reduce((sum, segment) => sum + segment.statuses.length, 0);

  // Forward fetch, reused for both the very first load and manual refresh:
  // an empty store has no head to filter with `since_id`, so it degrades to
  // the param-less initial request (ADR-0004 amendment, "Segment model").
  const refresh = async (): Promise<number | undefined> => {
    if (refreshInFlight) return undefined;
    refreshInFlight = true;
    const headId = segments()[0]?.statuses[0]?.id;
    setLoading(true);
    const result =
      headId === undefined
        ? await toResult(client.GET("/api/v1/timelines/home"))
        : await toResult(
            client.GET("/api/v1/timelines/home", {
              params: { query: { since_id: headId, limit: PAGE_LIMIT } },
            }),
          );
    setLoading(false);
    refreshInFlight = false;

    if (!result.ok) {
      setError(result.error);
      return undefined;
    }
    setError(undefined);
    // Gap uncertainty only makes sense relative to an existing head; the
    // empty-store case always adopts the page outright regardless of size.
    const mayHaveGap =
      headId !== undefined && result.value.length === PAGE_LIMIT;
    // No awaits between reading `current` and `setSegments`, so the delta
    // is exactly this refresh's contribution — a concurrently-completing
    // older-fetch settles at some other microtask, never in between.
    const current = segments();
    const updated = applyRefresh(current, result.value, mayHaveGap);
    setSegments(updated);
    return countStatuses(updated) - countStatuses(current);
  };

  // Actual older-fetch: one anchor's page, applied to segments. Called only
  // from `drainOlderQueue`, never directly, so serialisation is a property
  // of the queue (single in-flight) rather than a per-call guard.
  const fetchOlderFor = async (anchorId: string): Promise<void> => {
    // Only this anchor's own stale failure is cleared. Other anchors that
    // failed while queued behind us must keep their error visible so the
    // user can still retry them from their own row.
    setLoadOlderFailures((prev) => prev.filter((f) => f.anchorId !== anchorId));
    const result = await toResult(
      client.GET("/api/v1/timelines/home", {
        params: { query: { max_id: anchorId, limit: PAGE_LIMIT } },
      }),
    );

    if (!result.ok) {
      setLoadOlderFailures((prev) => [
        ...prev.filter((f) => f.anchorId !== anchorId),
        { anchorId, error: result.error },
      ]);
      return;
    }

    // Re-resolve the target by anchor id rather than trusting the index
    // captured before the request: a `refresh` completing mid-flight can
    // have unshifted a new head segment, shifting every later index. The
    // lookup is by *membership*, not tail identity: a preceding queued
    // cascade-merge can have carried its segment's tail past this anchor
    // (keeping page items beyond the old tail), leaving the anchor interior
    // to the merged segment. The response is still a contiguous run below
    // the anchor, so handing it to `appendOlder` stays correct — its dedupe
    // strips whatever the merge already brought in and appends the rest.
    // A tail-identity lookup instead dropped such a page outright, and the
    // sentinel stalled until the next IntersectionObserver fire
    // (round-2 dual-review finding).
    const latest = segments();
    const idx = latest.findIndex((segment) =>
      segment.statuses.some((status) => status.id === anchorId),
    );
    // The anchor status is in no segment at all. Statuses are never removed
    // from the store, so this shouldn't happen — kept as a safety net so a
    // surprise drops one page instead of corrupting a segment.
    if (idx === -1) return;

    const updated = appendOlder(latest, idx, result.value);
    // A short page from `max_id=anchor` proves the server holds less than a
    // page below the anchor — everything older is now known. That verdict
    // is about the *post-merge* shape: judged pre-merge, a short gap fill
    // that reaches the tail segment and collapses into it would leave
    // `exhausted` unset and cost the sentinel one provably-empty extra
    // fetch (dual-review finding). The merged run keeps index `idx`, so
    // "the anchor's run is the tail" is `idx === updated.length - 1`.
    if (idx === updated.length - 1 && result.value.length < PAGE_LIMIT) {
      setExhausted(true);
    }
    setSegments(updated);
  };

  // Drains the queue one anchor at a time until empty. Runs at most once
  // concurrently: `loadOlder` only starts a new drain when it observes an
  // empty queue before its own push (see `wasEmpty` below).
  const drainOlderQueue = async (): Promise<void> => {
    while (true) {
      const anchorId = pendingOlderAnchors()[0];
      if (anchorId === undefined) return;
      await fetchOlderFor(anchorId);
      // Errors are absorbed inside `fetchOlderFor` (stored per anchor in
      // `loadOlderFailures`); the queue advances either way so that one
      // failure doesn't strand the remaining anchors.
      setPendingOlderAnchors((prev) => prev.slice(1));
    }
  };

  // Extends segment `segmentIndex`'s tail with an older page (`max_id` =
  // that segment's last status). Reused for both infinite-scroll and gap
  // fill (ADR-0004 amendment) — the caller (sentinel or gap row, Unit 3)
  // decides which segment to target.
  const loadOlder = async (segmentIndex: number): Promise<void> => {
    const current = segments();
    const anchorId = current[segmentIndex]?.statuses.at(-1)?.id;
    if (anchorId === undefined) return;

    // Dedup: a re-click on the same gap row, or a re-fire from
    // IntersectionObserver, must not stack duplicate work on the queue.
    if (pendingOlderAnchors().includes(anchorId)) return;

    const wasEmpty = pendingOlderAnchors().length === 0;
    setPendingOlderAnchors((prev) => [...prev, anchorId]);
    if (!wasEmpty) return;

    await drainOlderQueue();
  };

  // `segmentIndex` here is a UI-facing position, not an anchor id; the
  // accessors re-derive "is this row's segment currently pending" from the
  // *current* `segments()` so they keep pointing at the right row even if
  // a concurrent refresh has shifted indices meanwhile.
  const anchorOf = (segmentIndex: number): string | undefined =>
    segments()[segmentIndex]?.statuses.at(-1)?.id;

  return {
    segments,
    loading,
    error,
    loadingOlder: (segmentIndex) => {
      const anchor = anchorOf(segmentIndex);
      return anchor !== undefined && pendingOlderAnchors().includes(anchor);
    },
    loadOlderError: (segmentIndex) => {
      const anchor = anchorOf(segmentIndex);
      if (anchor === undefined) return undefined;
      return loadOlderFailures().find((f) => f.anchorId === anchor)?.error;
    },
    exhausted,
    refresh,
    loadOlder,
  };
};
