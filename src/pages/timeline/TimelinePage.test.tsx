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
// (flake IDs are lexicographically comparable — plan doc).
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
// store decides a refresh result "may have a gap" behind it (plan doc,
// "API 実測結果"). Newest-first (descending ids), like every real page and
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
  // here (plan doc, dogfooding fix); DOM identity survives *because* an
  // unchanged Status object reference (segments.ts keeps refs stable
  // through applyRefresh) keeps its own DOM node in the flat `<For>` — the
  // old nested-per-segment `<For>` instead rebuilt this card's subtree
  // whenever `applyRefresh` produced a new segment wrapper, which is the
  // scroll-jump bug this asserts against.
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
  // id — plan doc), consistent with the fixtures' descending-id invariant.
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
  // directly, per plan doc.
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
  // once `appendOlder` replaced the segment wrapper — plan doc).
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
  // exhausted — `shouldTriggerLoadOlder` re-checks `exhausted` fresh on
  // every call, independent of whether the sentinel is still mounted.
  observer?.fireVisible();
  expect(await findByText(/all caught up/i)).toBeInTheDocument();
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
