import { type Accessor, batch, createSignal } from "solid-js";
import type { ApiError } from "../../api/client";
import { PAGE_LIMIT } from "../../api/pagination";
import type { Result } from "../../api/result";

/**
 * Content a list can resume from instead of fetching its first page: the items
 * it had accumulated and the `exhausted` verdict they were left with. Held by
 * reference (never serialised) — item object identity is what keeps the
 * rendered rows, and with them the browser's scroll anchors, stable across the
 * resume. The `max_id` cursor is the tail's own id, so it needs no room here.
 */
export type CursorListSnapshot<T> = {
  readonly items: readonly T[];
  readonly exhausted: boolean;
};

export type CursorListStore<T> = {
  items: Accessor<readonly T[]>;
  /**
   * True while the first page is in flight, and, for a store that has to fetch
   * that page at all, from creation until `loadInitial` starts it — an empty
   * list would otherwise flash the empty-success row before the mount effect
   * fires.
   */
  loading: Accessor<boolean>;
  /** Last first-page failure; the list is empty whenever this is set. */
  error: Accessor<ApiError | undefined>;
  loadingOlder: Accessor<boolean>;
  loadOlderError: Accessor<ApiError | undefined>;
  /**
   * True once a short page proves nothing older exists. Sticky: this list only
   * ever grows at the tail, so the verdict has no reason to flip back. A store
   * resuming from a snapshot inherits the verdict that snapshot carried.
   */
  exhausted: Accessor<boolean>;
  /**
   * Mount-time entry point, and the initial-error Retry. A no-op once the
   * first page is no longer owed — a store resuming from a snapshot owes none
   * to begin with.
   */
  loadInitial: () => Promise<void>;
  loadOlder: () => Promise<void>;
};

/**
 * A flat, append-only list paged by a single `max_id` cursor (the tail item's
 * own id): the posts under a profile header (ProfilePage.tsx) and either side
 * of an account's social graph (FollowList.tsx).
 *
 * Deliberately not the timeline's store: segments, gap markers and refresh
 * exist there because a timeline grows at the front while the reader is in it
 * (ADR-0004 amendment). These lists have no front to grow from — nothing
 * refreshes them and nothing streams into them — so a run of items and one
 * cursor is the whole model.
 *
 * Created per mounted list and never reset by hand: a different account, tab
 * or side gets a different store because the route recreates the component
 * holding it (App.tsx gives each its own leaf, ProfilePage.tsx keys the body
 * on the acct), which is also why the page to fetch is a closure handed in
 * here rather than parameters this store re-reads. `resume` is what a reader
 * popping back onto this history entry left behind; what outlives the page is
 * that snapshot, never a live store (src/entities/retention/retention.tsx).
 * Whether a first page is still owed after that is this store's own business,
 * not a condition the page re-derives (ADR-0004 amendment 2026-08-09).
 */
export const createCursorListStore = <T extends { id?: string }>(
  fetchPage: (maxId?: string) => Promise<Result<T[], ApiError>>,
  resume?: CursorListSnapshot<T>,
): CursorListStore<T> => {
  const [items, setItems] = createSignal<readonly T[]>(resume?.items ?? []);
  // Starting true with a snapshot would strand the list on "Loading…": it has
  // content already, and the first load it would be waiting for is not owed.
  const [loading, setLoading] = createSignal(resume === undefined);
  const [error, setError] = createSignal<ApiError>();
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  const [loadOlderError, setLoadOlderError] = createSignal<ApiError>();
  const [exhausted, setExhausted] = createSignal(resume?.exhausted ?? false);

  // Reentry guard shared by the mount call and the initial-error Retry.
  // `loading` cannot serve as one: it is true from creation, before any fetch
  // has started, precisely so the empty row cannot flash.
  let initialInFlight = false;

  // Whether the very first page is still owed. Cleared on success rather than
  // before the fetch, because the initial-error Retry comes back through this
  // same entry point: a failed first load leaves the page owing one still.
  let initialLoadOwed = resume === undefined;

  const loadInitial = async (): Promise<void> => {
    if (!initialLoadOwed || initialInFlight) return;
    initialInFlight = true;
    setLoading(true);
    const result = await fetchPage();
    initialInFlight = false;
    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    initialLoadOwed = false;
    setError(undefined);
    setItems(result.value);
    setExhausted(result.value.length < PAGE_LIMIT);
  };

  const loadOlder = async (): Promise<void> => {
    if (loadingOlder()) return;
    // `id` is optional in the generated types even though every real status
    // and account carries one (segments.ts holds the same line); an idless
    // tail simply ends the list rather than paging from `undefined`.
    const cursor = items().at(-1)?.id;
    if (cursor === undefined) return;

    setLoadingOlder(true);
    // Cleared before the request, not after: the sentinel's own `retrying`
    // flag is what keeps its Retry button mounted across the gap
    // (ProfilePage.tsx).
    setLoadOlderError(undefined);
    const result = await fetchPage(cursor);

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
    if (page.length < PAGE_LIMIT) setExhausted(true);
    setItems((current) => {
      // The cursor item itself comes back in some instances' pages, and a
      // delete or an unfollow between requests can shift a page's window over
      // what is already held.
      const known = new Set(current.map((item) => item.id ?? ""));
      return [...current, ...page.filter((item) => !known.has(item.id ?? ""))];
    });
  };

  return {
    items,
    loading,
    error,
    loadingOlder,
    loadOlderError,
    exhausted,
    loadInitial,
    loadOlder,
  };
};
