import { createRoot } from "solid-js";
import { describe, expect, test } from "vitest";
import type { ApiError } from "../../api/client";
import { err, ok, type Result } from "../../api/result";
import type { Status } from "../../entities/status/types";
import type { Segment } from "./segments";
import {
  createTimelineStore,
  type TimelineSnapshot,
  type TimelineStore,
} from "./timeline-store";
import type { FetchTimelinePage, TimelinePageParams } from "./timelines";

// Ids are fixed-length and lexicographically ordered so that reading them in
// a fixture matches the newest-first order the store keeps them in.
const status = (id: string): Status => ({ id });
const segment = (...idList: string[]): Segment => ({
  statuses: idList.map(status),
});
const ids = (store: TimelineStore): string[] =>
  store
    .segments()
    .flatMap((s) => s.statuses)
    .map((s) => s.id ?? "");

const offline: ApiError = { kind: "network", cause: new Error("offline") };

// The store's paging seam (timelines.ts supplies four of these in
// production) stands in for the network here: the contract under test is
// which requests the store decides to make, so the responses are canned and
// the params recorded.
const fetcher = (
  ...responses: readonly Result<Status[], ApiError>[]
): { calls: TimelinePageParams[]; fetchPage: FetchTimelinePage } => {
  const calls: TimelinePageParams[] = [];
  const fetchPage: FetchTimelinePage = (params) => {
    const response = responses[calls.length] ?? ok([]);
    calls.push(params);
    return Promise.resolve(response);
  };
  return { calls, fetchPage };
};

// The store builds memos, and Solid disposes computations through their
// owner: giving each case its own root keeps one test's reactive graph from
// outliving it.
const withStore = async (
  build: () => TimelineStore,
  body: (store: TimelineStore) => Promise<void>,
): Promise<void> => {
  let dispose = (): void => {};
  const store = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return build();
  });
  try {
    await body(store);
  } finally {
    dispose();
  }
};

describe("createTimelineStore without retained content", () => {
  test("shows loading from creation and fetches nothing until loadInitial", async () => {
    const { calls, fetchPage } = fetcher();
    await withStore(
      () => createTimelineStore(fetchPage),
      async (store) => {
        expect(store.loading()).toBe(true);
        expect(store.segments()).toEqual([]);
        expect(calls).toEqual([]);
      },
    );
  });

  test("loadInitial fetches the first page with no paging params", async () => {
    const { calls, fetchPage } = fetcher(ok([status("s10"), status("s09")]));
    await withStore(
      () => createTimelineStore(fetchPage),
      async (store) => {
        await store.loadInitial();
        expect(calls).toEqual([{}]);
        expect(ids(store)).toEqual(["s10", "s09"]);
        expect(store.loading()).toBe(false);
      },
    );
  });

  test("a second loadInitial does not fetch again", async () => {
    const { calls, fetchPage } = fetcher(ok([status("s10")]));
    await withStore(
      () => createTimelineStore(fetchPage),
      async (store) => {
        await store.loadInitial();
        await store.loadInitial();
        expect(calls).toHaveLength(1);
      },
    );
  });

  test("a failed first load is retried through refresh, not through loadInitial", async () => {
    const { calls, fetchPage } = fetcher(err(offline), ok([status("s10")]));
    await withStore(
      () => createTimelineStore(fetchPage),
      async (store) => {
        await store.loadInitial();
        expect(store.error()).toEqual(offline);

        // The debt is settled even though the fetch failed: recovery is the
        // Retry affordance's job, and a mount hook firing again must not
        // silently re-request.
        await store.loadInitial();
        expect(calls).toHaveLength(1);

        await store.refresh();
        expect(calls).toHaveLength(2);
        expect(store.error()).toBeUndefined();
        expect(ids(store)).toEqual(["s10"]);
      },
    );
  });
});

describe("createTimelineStore resumed from a snapshot", () => {
  const snapshot = (
    segments: readonly Segment[],
    exhausted = false,
  ): TimelineSnapshot => ({ segments, exhausted });

  test("shows the retained content immediately instead of loading", async () => {
    const { calls, fetchPage } = fetcher();
    await withStore(
      () => createTimelineStore(fetchPage, snapshot([segment("s10", "s09")])),
      async (store) => {
        expect(store.loading()).toBe(false);
        expect(ids(store)).toEqual(["s10", "s09"]);
        expect(calls).toEqual([]);
      },
    );
  });

  test("loadInitial fetches nothing: refreshing would push the retained content down", async () => {
    const { calls, fetchPage } = fetcher();
    await withStore(
      () => createTimelineStore(fetchPage, snapshot([segment("s10", "s09")])),
      async (store) => {
        await store.loadInitial();
        expect(calls).toEqual([]);
        expect(ids(store)).toEqual(["s10", "s09"]);
        expect(store.loading()).toBe(false);
      },
    );
  });

  test("keeps the retained statuses by reference", async () => {
    const { fetchPage } = fetcher();
    // Card identity across the resume rides on these object references (the
    // rendered `<For>` is keyed by them), so the store must hand back the
    // very objects it was given, not copies.
    const retained = status("s10");
    await withStore(
      () =>
        createTimelineStore(fetchPage, snapshot([{ statuses: [retained] }])),
      async (store) => {
        expect(store.segments()[0]?.statuses[0]).toBe(retained);
      },
    );
  });

  test("inherits the snapshot's exhausted verdict", async () => {
    const { fetchPage } = fetcher();
    await withStore(
      () => createTimelineStore(fetchPage, snapshot([segment("s10")], true)),
      async (store) => {
        expect(store.exhausted()).toBe(true);
      },
    );
  });

  test("refresh still updates, anchored on the retained head", async () => {
    const { calls, fetchPage } = fetcher(ok([status("s12"), status("s11")]));
    await withStore(
      () => createTimelineStore(fetchPage, snapshot([segment("s10", "s09")])),
      async (store) => {
        const applied = await store.refresh();
        expect(calls).toEqual([{ since_id: "s10", limit: 40 }]);
        expect(applied).toBe(2);
        expect(ids(store)).toEqual(["s12", "s11", "s10", "s09"]);
      },
    );
  });
});
