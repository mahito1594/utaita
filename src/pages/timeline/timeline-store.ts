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
  loadingOlder: (segmentIndex: number) => boolean;
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
  const [loadingOlderIndex, setLoadingOlderIndex] = createSignal<number>();

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
  // fill (plan doc) — the caller decides which segment to target; the
  // sentinel/gap UI that drives this arrives in Unit 3.
  const loadOlder = async (segmentIndex: number): Promise<void> => {
    const lastId = segments()[segmentIndex]?.statuses.at(-1)?.id;
    if (lastId === undefined) return;

    setLoadingOlderIndex(segmentIndex);
    const result = await toResult(
      client.GET("/api/v1/timelines/home", {
        params: { query: { max_id: lastId, limit: PAGE_LIMIT } },
      }),
    );
    setLoadingOlderIndex(undefined);
    if (!result.ok) return;
    setSegments((current) => appendOlder(current, segmentIndex, result.value));
  };

  return {
    segments,
    loading,
    error,
    loadingOlder: (segmentIndex) => loadingOlderIndex() === segmentIndex,
    refresh,
    loadOlder,
  };
};
