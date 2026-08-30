import { type Accessor, batch, createSignal } from "solid-js";
import type { ApiError } from "../../api/client";
import type { Status } from "../../entities/status/types";
import { fetchAccountPosts, POSTS_PAGE_LIMIT } from "./profile-api";

export type ProfilePostsStore = {
  statuses: Accessor<readonly Status[]>;
  /**
   * True while the first page is in flight, and from creation until
   * `loadInitial` starts that fetch — an empty list would otherwise flash the
   * empty-success row before the mount effect fires.
   */
  loading: Accessor<boolean>;
  /** Last first-page failure; the list is empty whenever this is set. */
  error: Accessor<ApiError | undefined>;
  loadingOlder: Accessor<boolean>;
  loadOlderError: Accessor<ApiError | undefined>;
  /**
   * True once a short page proves nothing older exists. Sticky: this list only
   * ever grows at the tail, so the verdict has no reason to flip back.
   */
  exhausted: Accessor<boolean>;
  /** Mount-time entry point, and the initial-error Retry. */
  loadInitial: () => Promise<void>;
  loadOlder: () => Promise<void>;
};

/**
 * The posts under a profile header: a flat, append-only list paged by a single
 * `max_id` cursor (the tail's id).
 *
 * Deliberately not the timeline's store: segments, gap markers and refresh
 * exist there because a timeline grows at the front while the reader is in it
 * (ADR-0004 amendment). A profile list has no front to grow from — nothing
 * refreshes it and nothing streams into it — so a run of statuses and one
 * cursor is the whole model.
 *
 * Created per mounted profile body and never reset: a different `acct` gets a
 * different store because the page recreates the component holding it
 * (ProfilePage.tsx).
 */
export const createProfilePostsStore = (acct: string): ProfilePostsStore => {
  const [statuses, setStatuses] = createSignal<readonly Status[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<ApiError>();
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  const [loadOlderError, setLoadOlderError] = createSignal<ApiError>();
  const [exhausted, setExhausted] = createSignal(false);

  // Reentry guard shared by the mount call and the initial-error Retry.
  // `loading` cannot serve as one: it is true from creation, before any fetch
  // has started, precisely so the empty row cannot flash.
  let initialInFlight = false;

  const loadInitial = async (): Promise<void> => {
    if (initialInFlight) return;
    initialInFlight = true;
    setLoading(true);
    const result = await fetchAccountPosts(acct, {});
    initialInFlight = false;
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setStatuses(result.value);
    setExhausted(result.value.length < POSTS_PAGE_LIMIT);
  };

  const loadOlder = async (): Promise<void> => {
    if (loadingOlder()) return;
    // `id` is optional in the generated type even though every real status
    // carries one (segments.ts holds the same line); an idless tail simply
    // ends the list rather than paging from `undefined`.
    const cursor = statuses().at(-1)?.id;
    if (cursor === undefined) return;

    setLoadingOlder(true);
    // Cleared before the request, not after: the sentinel's own `retrying`
    // flag is what keeps its Retry button mounted across the gap
    // (ProfilePage.tsx).
    setLoadOlderError(undefined);
    const result = await fetchAccountPosts(acct, { maxId: cursor });

    if (!result.ok) {
      // One update, not two: effects run between separate writes, and an
      // in-between state of "not loading, no error" is one where the sentinel's
      // error row has no reason to be mounted — it would take the Retry button
      // the reader just pressed, and their focus, with it (ProfilePage.tsx).
      batch(() => {
        setLoadingOlder(false);
        setLoadOlderError(result.error);
      });
      return;
    }
    setLoadingOlder(false);
    const page = result.value;
    if (page.length < POSTS_PAGE_LIMIT) setExhausted(true);
    setStatuses((current) => {
      // The cursor post itself comes back in some instances' pages, and an
      // interleaved delete can shift a page's window over what is already
      // held.
      const known = new Set(current.map((status) => status.id ?? ""));
      return [
        ...current,
        ...page.filter((status) => !known.has(status.id ?? "")),
      ];
    });
  };

  return {
    statuses,
    loading,
    error,
    loadingOlder,
    loadOlderError,
    exhausted,
    loadInitial,
    loadOlder,
  };
};
