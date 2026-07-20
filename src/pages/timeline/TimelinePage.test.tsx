// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { TimelinePage } from "./TimelinePage";

// happy-dom's IntersectionObserver constructs but never actually calls back
// (see TimelinePage.tsx's Sentinel) — this fake stands in for the global so
// scroll-trigger tests can invoke the captured callback by hand instead.
// jsdom does not implement IntersectionObserver at all (jsdom/jsdom#2032,
// open), so switching test environments would not remove the need for this
// fake.
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  // Test helper: simulate the sentinel row scrolling into view.
  fireVisible(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment).
const statuses: Status[] = [
  {
    id: "110000000000000001",
    content: "<p>Hello from fixture one</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  },
  {
    id: "110000000000000002",
    content: "<p>Second fixture status</p>",
    created_at: "2026-07-05T11:00:00.000Z",
    account: {
      id: "900000000000000002",
      acct: "bob",
      display_name: "Bob Local",
    },
  },
];

// A fixture status whose id sorts newer than everything in `statuses` above
// (flake IDs are lexicographically comparable — docs/PLAN.ja.md, Akkoma
// pitfalls).
const newerStatus = (id: string, content: string): Status => ({
  id,
  content: `<p>${content}</p>`,
  created_at: "2026-07-06T12:00:00.000Z",
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

// A full 40-item page: exactly at the server's clamp, which is how the
// store decides a refresh result "may have a gap" behind it (ADR-0004
// amendment). Newest-first (descending ids), like every real page and
// the segment model's invariant — Unit 3's gap tests reuse this fixture, and
// an ascending page would mask ordering bugs in appendOlder/applyRefresh.
const fullPage: Status[] = Array.from({ length: 40 }, (_, i) => {
  const suffix = 39 - i;
  return newerStatus(
    `12000000000000${String(suffix).padStart(4, "0")}`,
    `Full page item ${suffix}`,
  );
});

// MSW is the only mock seam (ADR-0009): tests exercise the real client,
// toResult, and page rendering; only HTTP is simulated.
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  FakeIntersectionObserver.instances = [];
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

const renderTimeline = () =>
  render(() => (
    <MemoryRouter>
      <Route path="/" component={TimelinePage} />
    </MemoryRouter>
  ));

test("renders fetched statuses as cards", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json(statuses)),
  );
  const { findByText } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
  expect(await findByText("Alice Example")).toBeInTheDocument();
});

test("renders a sign-in prompt when the timeline answers 401", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json(
        { error: "authorization required for timeline view" },
        { status: 401 },
      ),
    ),
  );
  const { findByRole } = renderTimeline();

  // role="alert" so the error is announced, not merely painted.
  expect(await findByRole("alert")).toHaveTextContent(/sign-in required/i);
});

test("renders a sign-in prompt when the timeline answers 403", async () => {
  // The real shape of an unauthenticated home timeline (Akkoma answers 403
  // there, 401 on public — verified against the reference instance).
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json({ error: "Invalid credentials." }, { status: 403 }),
    ),
  );
  const { findByText } = renderTimeline();

  expect(await findByText(/sign-in required/i)).toBeInTheDocument();
});

test("renders a retry affordance when the network fails", async () => {
  server.use(http.get("*/api/v1/timelines/home", () => HttpResponse.error()));
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText(/connection failed/i)).toBeInTheDocument();
  expect(await findByRole("button", { name: "Retry" })).toBeInTheDocument();
});

test("refresh prepends newer statuses ahead of the existing ones", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      expect(sinceId).toBe(statuses[0]?.id);
      return HttpResponse.json([
        newerStatus("110000000000000003", "Brand new"),
      ]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("Brand new")).toBeInTheDocument();
  // Existing content survives the refresh, not just the new item.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
});

test("a refresh prepend keeps existing cards' DOM identity intact (scroll-anchor proxy)", async () => {
  // happy-dom has no layout, so scroll anchoring itself can't be observed
  // here (ADR-0004 amendment); DOM identity survives
  // *because* an unchanged Status object reference (segments.ts keeps refs
  // stable through applyRefresh) keeps its own DOM node in the flat `<For>`
  // — the old nested-per-segment `<For>` instead rebuilt this card's
  // subtree whenever `applyRefresh` produced a new segment wrapper, which
  // is the scroll-jump bug this asserts against.
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json([
        newerStatus("110000000000000003", "Brand new"),
      ]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  const existingCard = (await findByText("Hello from fixture one")).closest(
    "article",
  );
  expect(existingCard).not.toBeNull();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Brand new")).toBeInTheDocument();

  const cardAfterRefresh = (await findByText("Hello from fixture one")).closest(
    "article",
  );
  expect(cardAfterRefresh).toBe(existingCard);
});

test("a full-page refresh still renders the new statuses (gap resolution is Unit 3's job)", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      expect(sinceId).toBe(statuses[0]?.id);
      return HttpResponse.json(fullPage);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("Full page item 0")).toBeInTheDocument();
  expect(await findByText("Full page item 39")).toBeInTheDocument();
  // The old segment is still there too, just behind the (as yet unmarked)
  // gap boundary.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
});

test("a refresh failure surfaces a notice without blanking existing content", async () => {
  let refreshRequested = false;
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      refreshRequested = true;
      return HttpResponse.error();
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText(/refresh failed/i)).toBeInTheDocument();
  expect(refreshRequested).toBe(true);
  // The existing cards are untouched by the failed refresh.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
});

test("a scroll-triggered sentinel loads and appends an older page", async () => {
  // Lexicographically older than every id in `statuses` (flake IDs sort by
  // id — docs/PLAN.ja.md, Akkoma pitfalls), consistent with the fixtures'
  // descending-id invariant.
  const olderStatus = newerStatus("109999999999999999", "Older fixture status");
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      expect(maxId).toBe(statuses[1]?.id);
      return HttpResponse.json([olderStatus]);
    }),
  );
  const { findByText } = renderTimeline();

  expect(await findByText("Second fixture status")).toBeInTheDocument();

  // happy-dom's IntersectionObserver never fires on its own; the fake
  // installed above lets the test simulate the sentinel scrolling into view
  // directly.
  const observer = FakeIntersectionObserver.instances.at(-1);
  expect(observer).toBeDefined();
  observer?.fireVisible();

  expect(await findByText("Older fixture status")).toBeInTheDocument();
  // The newer content is untouched by the tail-ward fetch.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
});

test("a tail append keeps existing cards' DOM identity intact (scroll-anchor proxy)", async () => {
  // Same reasoning as the refresh-prepend identity test above, but for the
  // sentinel path: the tail append is exactly the case that used to slide
  // the viewport (the sentinel row was the only stable anchor candidate
  // once `appendOlder` replaced the segment wrapper — ADR-0004 amendment).
  const olderStatus = newerStatus("109999999999999999", "Older fixture status");
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      return HttpResponse.json([olderStatus]);
    }),
  );
  const { findByText } = renderTimeline();

  const existingCard = (await findByText("Second fixture status")).closest(
    "article",
  );
  expect(existingCard).not.toBeNull();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();
  expect(await findByText("Older fixture status")).toBeInTheDocument();

  const cardAfterAppend = (await findByText("Second fixture status")).closest(
    "article",
  );
  expect(cardAfterAppend).toBe(existingCard);
});

test("clicking a gap marker after a full-page refresh merges the segments and the marker disappears", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId !== null) {
        // The gap marker's `loadOlder` walks from the new segment's tail
        // (the full page's oldest item) looking for the old head.
        expect(maxId).toBe(fullPage.at(-1)?.id);
        return HttpResponse.json([statuses[0] as Status]);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );
  const { findByText, findByRole, queryByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  const gapMarker = await findByRole("button", { name: "Load missed posts" });
  await userEvent.click(gapMarker);

  // The gap closes: `appendOlder` merges the two segments once the fetch
  // reaches the old head, and the marker's own boundary disappears with it.
  await waitFor(() =>
    expect(
      queryByRole("button", { name: "Load missed posts" }),
    ).not.toBeInTheDocument(),
  );
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Full page item 0")).toBeInTheDocument();
});

test("a loadOlder failure at the sentinel shows a retry affordance, and retrying succeeds", async () => {
  let olderRequestCount = 0;
  const recoveredStatus = newerStatus(
    "109999999999999999",
    "Recovered after retry",
  );
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      olderRequestCount += 1;
      if (olderRequestCount === 1) return HttpResponse.error();
      return HttpResponse.json([recoveredStatus]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Second fixture status")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  expect(await findByText(/couldn't load more/i)).toBeInTheDocument();
  // Existing content survives the failed tail fetch.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("Recovered after retry")).toBeInTheDocument();
  expect(olderRequestCount).toBe(2);
});

test("once a tail loadOlder returns fewer than the page limit, the sentinel stops requesting", async () => {
  let olderRequestCount = 0;
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      olderRequestCount += 1;
      // Fewer than the 40-item page limit: nothing older remains.
      return HttpResponse.json([]);
    }),
  );
  const { findByText } = renderTimeline();

  expect(await findByText("Second fixture status")).toBeInTheDocument();

  const observer = FakeIntersectionObserver.instances.at(-1);
  observer?.fireVisible();

  // The quiet end marker replaces the sentinel once exhausted is proven.
  expect(await findByText(/all caught up/i)).toBeInTheDocument();
  expect(olderRequestCount).toBe(1);

  // A stray re-fire (IO firing again while the row is technically still
  // visible) must not repeat the request now that the store knows it's
  // exhausted — `requestOlderAtTail` re-reads `store.exhausted()` fresh
  // on every fire, independent of whether the sentinel is still mounted.
  observer?.fireVisible();
  expect(await findByText(/all caught up/i)).toBeInTheDocument();
  expect(olderRequestCount).toBe(1);
});

test("renders an empty-success row when the timeline responds with no statuses", async () => {
  // A brand-new account (or one following nobody yet): the fetch succeeds
  // but returns an empty array, so no segment is ever created. Without an
  // explicit empty row the panel body would just show a blank strip.
  server.use(http.get("*/api/v1/timelines/home", () => HttpResponse.json([])));
  const { findByText } = renderTimeline();

  expect(await findByText(/no posts yet/i)).toBeInTheDocument();
});

test("a successful refresh with new posts announces the count via the live region", async () => {
  // The live region carries the outcome of a *manual* refresh only; focus
  // stays on the refresh button. Screen readers pick up the change from
  // this permanently-mounted region, not from a role-switch or a focus
  // move.
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json([
        newerStatus("110000000000000003", "Brand new"),
        newerStatus("110000000000000004", "Also new"),
      ]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("2 new posts loaded")).toBeInTheDocument();
});

test("a refresh with nothing new announces 'No new posts' via the live region", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json([]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("No new posts")).toBeInTheDocument();
});

test("a sentinel fetch queues instead of being dropped while a gap fill is in flight", async () => {
  // Two older-fetches want to run at once: the gap fill (for the new head
  // segment after a full-page refresh) and the sentinel-triggered tail
  // fetch (for the old segment below the gap). Pre-fix, the store's
  // single-in-flight guard silently dropped the second — reaching the
  // tail again required an IntersectionObserver re-fire that only comes
  // from a scroll, which won't happen if the user is already parked at
  // the bottom. Post-fix, the second is queued and drains after the first
  // resolves.
  let releaseGapFill: (() => void) | undefined;
  const gapFillGate = new Promise<void>((resolve) => {
    releaseGapFill = resolve;
  });
  const olderStatus = newerStatus("109999999999999999", "Older via queue");
  const fullPageTailId = fullPage.at(-1)?.id;

  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId === fullPageTailId) {
        await gapFillGate;
        return HttpResponse.json([statuses[0] as Status]);
      }
      if (maxId !== null) {
        expect(maxId).toBe(statuses[1]?.id);
        return HttpResponse.json([olderStatus]);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );

  const { findByText, findByRole, queryByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  // Kick off the gap fill; it blocks on the gate.
  await userEvent.click(
    await findByRole("button", { name: "Load missed posts" }),
  );

  // Sentinel fires while the gap fill is in flight. Pre-fix, this call
  // was dropped by the single-anchor guard and the tail fetch stalled
  // until the user scrolled the sentinel back out and in.
  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  releaseGapFill?.();

  // The queued sentinel fetch runs after the gap fill merges the two
  // segments — the merger's tail (old S1's tail) is still the anchor id
  // captured at queue time, so the response lands correctly.
  expect(await findByText("Older via queue")).toBeInTheDocument();
  expect(
    queryByRole("button", { name: /load missed posts/i }),
  ).not.toBeInTheDocument();
});

test("a queued fetch that succeeds does not clear the preceding anchor's failure", async () => {
  // The store keeps failures per anchor: a later successful fetch drains
  // the queue but must not wipe the earlier anchor's error, or the user
  // loses the Retry affordance on the row that actually failed.
  const olderStatus = newerStatus(
    "109999999999999999",
    "Older after queued success",
  );
  const fullPageTailId = fullPage.at(-1)?.id;

  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId === fullPageTailId) {
        return HttpResponse.error();
      }
      if (maxId !== null) {
        expect(maxId).toBe(statuses[1]?.id);
        return HttpResponse.json([olderStatus]);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );

  const { findByText, findByRole, findAllByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  // Gap fill fails first, then the sentinel drains after it and succeeds.
  await userEvent.click(
    await findByRole("button", { name: "Load missed posts" }),
  );
  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  // The queued sentinel fetch succeeds and appends its older item...
  expect(await findByText("Older after queued success")).toBeInTheDocument();
  // ...but the gap row's own failure must still be visible with its own
  // Retry affordance, not silently wiped by the succeeding successor.
  expect(await findByText(/couldn't load more/i)).toBeInTheDocument();
  const retryButtons = await findAllByRole("button", { name: "Retry" });
  expect(retryButtons.length).toBeGreaterThan(0);
});

test("a re-fire of the sentinel while its fetch is in flight does not stack duplicate requests", async () => {
  // The store dedups by anchor id, so a re-fire targeting the same tail
  // segment must collapse into the single in-flight request rather than
  // queueing a second one.
  let releaseOlderFetch: (() => void) | undefined;
  const olderFetchGate = new Promise<void>((resolve) => {
    releaseOlderFetch = resolve;
  });
  let olderRequestCount = 0;
  const olderStatus = newerStatus("109999999999999999", "Older after dedup");

  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      olderRequestCount += 1;
      await olderFetchGate;
      return HttpResponse.json([olderStatus]);
    }),
  );

  const { findByText } = renderTimeline();
  expect(await findByText("Second fixture status")).toBeInTheDocument();

  const observer = FakeIntersectionObserver.instances.at(-1);
  observer?.fireVisible();
  observer?.fireVisible();
  observer?.fireVisible();

  releaseOlderFetch?.();
  expect(await findByText("Older after dedup")).toBeInTheDocument();
  expect(olderRequestCount).toBe(1);
});

test("a loadOlder in flight lands on its own segment even if a concurrent refresh shifts indices", async () => {
  // Held open until released below, so the refresh triggered while this is
  // in flight gets to complete first — reproducing the index-shift race
  // (a `refresh` unshifting a new head segment while `loadOlder`'s
  // originally-captured segment index for the *older* segment is stale).
  let releaseOlderPage: (() => void) | undefined;
  const olderPageGate = new Promise<void>((resolve) => {
    releaseOlderPage = resolve;
  });
  const olderStatus = newerStatus("109999999999999999", "Older fixture status");

  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId !== null) {
        await olderPageGate;
        return HttpResponse.json([olderStatus]);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );

  const { findByText, findByRole, container } = renderTimeline();

  expect(await findByText("Second fixture status")).toBeInTheDocument();

  // Start the tail-ward fetch for the (only, so-far) segment and leave it
  // hanging on `olderPageGate`.
  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  // A concurrent refresh resolves first, unshifting a full-page new head
  // segment ahead of the segment `loadOlder` above originally targeted —
  // that segment is now at index 1, not 0.
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  releaseOlderPage?.();

  // The older page must land on the segment it was actually fetched for
  // (now shifted to index 1), appended after its existing content — not on
  // the newly-unshifted head segment at index 0.
  expect(await findByText("Older fixture status")).toBeInTheDocument();

  const text = container.textContent ?? "";
  const fullPageIndex = text.indexOf("Full page item 0");
  const secondFixtureIndex = text.indexOf("Second fixture status");
  const olderStatusIndex = text.indexOf("Older fixture status");
  // Order intact: the full page segment, then the original segment's own
  // content, and only then the page appended to its tail. A stale-index
  // bug would instead splice "Older fixture status" onto the full page
  // segment, placing it before "Second fixture status".
  expect(fullPageIndex).toBeGreaterThanOrEqual(0);
  expect(secondFixtureIndex).toBeGreaterThan(fullPageIndex);
  expect(olderStatusIndex).toBeGreaterThan(secondFixtureIndex);
});

test("retry clicks while a retry is already in flight collapse into one request", async () => {
  // The store's reentry guard, not the Retry button, is what prevents two
  // param-less fetches from racing: the slower response would otherwise be
  // merged as though its page were newer than the freshly-adopted head,
  // prepending older statuses (a newest-first break).
  let releaseRetry: (() => void) | undefined;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  let requestCount = 0;
  server.use(
    http.get("*/api/v1/timelines/home", async () => {
      requestCount += 1;
      if (requestCount === 1) return HttpResponse.error();
      await retryGate;
      return HttpResponse.json(statuses);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  const retry = await findByRole("button", { name: "Retry" });
  await userEvent.click(retry);
  await userEvent.click(retry);

  releaseRetry?.();
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  // Initial load + exactly one retry — the second click was absorbed.
  expect(requestCount).toBe(2);
});

test("a retry that fails differently swaps the error rendering (network → sign-in)", async () => {
  // `<Show keyed>` must recreate TimelineError when the error value
  // changes: non-keyed, the truthy→truthy transition kept the stale
  // "Connection failed" + Retry on screen after the retry came back 403.
  let requestCount = 0;
  server.use(
    http.get("*/api/v1/timelines/home", () => {
      requestCount += 1;
      if (requestCount === 1) return HttpResponse.error();
      return HttpResponse.json(
        { error: "Invalid credentials." },
        { status: 403 },
      );
    }),
  );
  const { findByText, findByRole, queryByText } = renderTimeline();

  expect(await findByText(/connection failed/i)).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText(/sign-in required/i)).toBeInTheDocument();
  expect(queryByText(/connection failed/i)).not.toBeInTheDocument();
});

test("a short gap fill that reaches the tail segment proves exhaustion without an extra fetch", async () => {
  // Everything below the gap-fill anchor comes back in one short page that
  // merges into the (tail) old-head segment: the store must conclude
  // exhausted from the post-merge shape. Judged pre-merge (the old code),
  // the gap segment wasn't the tail at request time, so the sentinel
  // stayed mounted and burned one provably-empty extra request.
  let olderRequestCount = 0;
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId !== null) {
        olderRequestCount += 1;
        expect(maxId).toBe(fullPage.at(-1)?.id);
        // Short page (2 < 40) that reaches into the old head segment: the
        // full history below the anchor.
        return HttpResponse.json(statuses);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  await userEvent.click(
    await findByRole("button", { name: "Load missed posts" }),
  );

  expect(await findByText(/all caught up/i)).toBeInTheDocument();
  expect(olderRequestCount).toBe(1);
});

test("a sentinel re-fire while its failure is displayed does not auto-retry", async () => {
  // Once the failure row (with its Retry button) is on screen, an
  // IntersectionObserver re-fire from a scroll jiggle must not clear the
  // error and re-request on its own — retrying is the user's explicit
  // action.
  let olderRequestCount = 0;
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(statuses);
      olderRequestCount += 1;
      return HttpResponse.error();
    }),
  );
  const { findByText } = renderTimeline();

  expect(await findByText("Second fixture status")).toBeInTheDocument();

  const observer = FakeIntersectionObserver.instances.at(-1);
  observer?.fireVisible();
  expect(await findByText(/couldn't load more/i)).toBeInTheDocument();

  observer?.fireVisible();
  // Still just the one request, and the failure row is still there —
  // recovery belongs to the Retry button (covered by the retry test above).
  expect(await findByText(/couldn't load more/i)).toBeInTheDocument();
  expect(olderRequestCount).toBe(1);
});

test("a queued fetch still lands when a preceding cascade merge carries the tail past its anchor", async () => {
  // The cascade merge (round-1 fix) can extend the merged segment's tail
  // *past* a queued fetch's anchor: the gap-fill page reaches the old
  // segment AND carries statuses older than its tail, so the anchor — the
  // old tail — ends up interior to the merged segment. The queued fetch's
  // response must then still be applied via membership lookup; resolving
  // the anchor by tail identity instead dropped the fetched page, and the
  // timeline stalled until the next IntersectionObserver fire.
  let releaseGapFill: (() => void) | undefined;
  const gapFillGate = new Promise<void>((resolve) => {
    releaseGapFill = resolve;
  });
  const carriedPast = newerStatus(
    "109999999999999999",
    "Carried past the old tail",
  );
  const landedAfter = newerStatus(
    "109999999999999998",
    "Landed after the merge",
  );
  const fullPageTailId = fullPage.at(-1)?.id;

  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId === fullPageTailId) {
        await gapFillGate;
        // Reaches the old segment ([statuses]) and keeps going past its
        // tail: the cascade merge appends `carriedPast`, moving the merged
        // segment's tail beyond the queued anchor below.
        return HttpResponse.json([...statuses, carriedPast]);
      }
      if (maxId !== null) {
        // The queued sentinel fetch, anchored at the old tail (now interior
        // to the merged segment). Overlaps what the merge already brought
        // in, then continues older.
        expect(maxId).toBe(statuses[1]?.id);
        return HttpResponse.json([carriedPast, landedAfter]);
      }
      if (sinceId === null) return HttpResponse.json(statuses);
      return HttpResponse.json(fullPage);
    }),
  );

  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  expect(await findByText("Full page item 0")).toBeInTheDocument();

  // Gap fill goes out first and hangs; the sentinel queues behind it,
  // anchored at the old segment's tail.
  await userEvent.click(
    await findByRole("button", { name: "Load missed posts" }),
  );
  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  releaseGapFill?.();

  // The queued fetch's page must be applied — deduped against what the
  // merge already carried in, with the genuinely-new status appended.
  expect(await findByText("Carried past the old tail")).toBeInTheDocument();
  expect(await findByText("Landed after the merge")).toBeInTheDocument();
});

test("the refresh announcement counts only the refresh's own statuses, not a concurrently-landing older page", async () => {
  // An older page settling while the refresh is in flight must not inflate
  // "N new posts loaded" — the count comes from the store's own applied
  // delta, not a page-side total diff.
  let releaseOlder: (() => void) | undefined;
  const olderGate = new Promise<void>((resolve) => {
    releaseOlder = resolve;
  });
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const olderStatus = newerStatus("109999999999999999", "Older fixture status");

  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const url = new URL(request.url);
      const sinceId = url.searchParams.get("since_id");
      const maxId = url.searchParams.get("max_id");
      if (maxId !== null) {
        await olderGate;
        return HttpResponse.json([olderStatus]);
      }
      if (sinceId !== null) {
        await refreshGate;
        return HttpResponse.json([
          newerStatus("110000000000000003", "Brand new"),
        ]);
      }
      return HttpResponse.json(statuses);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  // Tail fetch goes out first and hangs; the manual refresh starts while
  // it is in flight and hangs on its own gate.
  FakeIntersectionObserver.instances.at(-1)?.fireVisible();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  // The older page lands *during* the refresh...
  releaseOlder?.();
  expect(await findByText("Older fixture status")).toBeInTheDocument();

  // ...and the refresh then settles with exactly one new status.
  releaseRefresh?.();
  expect(await findByText("Brand new")).toBeInTheDocument();
  expect(await findByText("1 new post loaded")).toBeInTheDocument();
});
