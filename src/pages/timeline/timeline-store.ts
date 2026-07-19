import { type Accessor, createSignal } from "solid-js";
import { type ApiError, client, toResult } from "../../api/client";
import { appendOlder, applyRefresh, type Segment } from "./segments";

// Home timeline's page size is clamped to 40 server-side (measured against
// the reference instance, see plan doc "API 実測結果"); a page that comes
// back exactly this long cannot rule out more statuses beyond it.
const PAGE_LIMIT = 40;

export type TimelineStore = {
  segments: Accessor<readonly Segment[]>;
  // True while a forward fetch (initial load or manual refresh — same
  // request shape, see `refresh` below) is in flight.
  loading: Accessor<boolean>;
  // Last forward-fetch failure. While `segments` is empty this is the
  // initial-load error (full-page rendering); once there is content, a
  // later failure here is a refresh failure and must not clear it
  // (non-destructive per plan doc).
  error: Accessor<ApiError | undefined>;
  // Both `loadingOlder`/`loadOlderError` take a UI-facing segment index but
  // resolve it against the *current* segment list on every call (see
  // `anchorOf` below) — so they keep tracking the right row even if a
  // concurrent `refresh` has shifted indices while a fetch is in flight.
  loadingOlder: (segmentIndex: number) => boolean;
  loadOlderError: (segmentIndex: number) => ApiError | undefined;
  // True once a fetch targeting the *tail* segment (checked against the
  // segment list as it stood when the response came back, not when the
  // request went out) has come back shorter than the page limit: nothing
  // older exists below it. Sticky — the timeline only ever grows from the
  // front, so this never has reason to flip back to false.
  exhausted: Accessor<boolean>;
  refresh: () => Promise<void>;
  loadOlder: (segmentIndex: number) => Promise<void>;
};

// Imperative shell (FCIS): plain async functions call the API and hand the
// result to Unit 1's pure segment functions. No throws (ADR-0008) — every
// outcome is a `Result` value this module inspects itself. Component-scoped
// (created inside TimelinePage, not a module singleton, per plan doc) so a
// login/logout page transition simply discards and recreates it.
export const createTimelineStore = (): TimelineStore => {
  const [segments, setSegments] = createSignal<readonly Segment[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<ApiError>();
  // Tracked by the target segment's tail-status id, not its array index:
  // `refresh` can unshift a new head segment while a `loadOlder` fetch for
  // some other segment is in flight (its button isn't disabled meanwhile),
  // which shifts every later index by +1. The tail id stays stable across
  // that — `refresh` only ever touches the head segment's front.
  const [loadingOlderAnchor, setLoadingOlderAnchor] = createSignal<string>();
  const [loadOlderFailure, setLoadOlderFailure] = createSignal<
    { anchorId: string; error: ApiError } | undefined
  >();
  const [exhausted, setExhausted] = createSignal(false);

  // Forward fetch, reused for both the very first load and manual refresh:
  // an empty store has no head to filter with `since_id`, so it degrades to
  // the param-less initial request (plan doc, "Empty store → param-less
  // initial load").
  const refresh = async (): Promise<void> => {
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

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    // Gap uncertainty only makes sense relative to an existing head; the
    // empty-store case always adopts the page outright regardless of size.
    const mayHaveGap =
      headId !== undefined && result.value.length === PAGE_LIMIT;
    setSegments((current) => applyRefresh(current, result.value, mayHaveGap));
  };

  // Extends segment `segmentIndex`'s tail with an older page (`max_id` =
  // that segment's last status). Reused for both infinite-scroll and gap
  // fill (plan doc) — the caller (sentinel or gap row, Unit 3) decides which
  // segment to target.
  const loadOlder = async (segmentIndex: number): Promise<void> => {
    // Re-trigger guard: IntersectionObserver can fire again while a fetch
    // for this (or any) segment is still in flight — a second concurrent
    // request would race the first's store update.
    if (loadingOlderAnchor() !== undefined) return;

    const current = segments();
    const anchorId = current[segmentIndex]?.statuses.at(-1)?.id;
    if (anchorId === undefined) return;

    setLoadingOlderAnchor(anchorId);
    setLoadOlderFailure(undefined);
    const result = await toResult(
      client.GET("/api/v1/timelines/home", {
        params: { query: { max_id: anchorId, limit: PAGE_LIMIT } },
      }),
    );
    setLoadingOlderAnchor(undefined);

    if (!result.ok) {
      setLoadOlderFailure({ anchorId, error: result.error });
      return;
    }

    // Re-resolve the target by anchor id rather than trusting the index
    // captured before the request: a `refresh` completing mid-flight can
    // have unshifted a new head segment, shifting every later index.
    const latest = segments();
    const idx = latest.findIndex(
      (segment) => segment.statuses.at(-1)?.id === anchorId,
    );
    // The anchor segment is gone — e.g. a gap-fill elsewhere already merged
    // it away. The page is stale; dropping it is correct (a future scroll
    // or click reissues the fetch against whatever segment exists now).
    if (idx === -1) return;

    if (idx === latest.length - 1 && result.value.length < PAGE_LIMIT) {
      setExhausted(true);
    }
    setSegments((prev) => appendOlder(prev, idx, result.value));
  };

  // `segmentIndex` here is a UI-facing position, not the anchor tracked
  // above; both accessors re-derive "is this row's segment the anchored
  // one" from the *current* `segments()` so they keep pointing at the
  // right row even if a concurrent refresh has shifted indices meanwhile.
  const anchorOf = (segmentIndex: number): string | undefined =>
    segments()[segmentIndex]?.statuses.at(-1)?.id;

  return {
    segments,
    loading,
    error,
    loadingOlder: (segmentIndex) => {
      const anchor = loadingOlderAnchor();
      return anchor !== undefined && anchorOf(segmentIndex) === anchor;
    },
    loadOlderError: (segmentIndex) => {
      const failure = loadOlderFailure();
      return failure !== undefined &&
        anchorOf(segmentIndex) === failure.anchorId
        ? failure.error
        : undefined;
    },
    exhausted,
    refresh,
    loadOlder,
  };
};
