// @vitest-environment happy-dom
// What the timeline keeps while the reader is off reading a conversation —
// the excursion the retention slot was actually built for, rather than the
// profile stub TimelinePage.retention.test.tsx makes the round trip through.
// The difference is that the thread route waits on data: the router holds the
// timeline page mounted for the whole transition, so the two pages' lifetimes
// overlap instead of meeting end to end.
import { A, MemoryRouter, query, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { type ParentProps, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Status } from "../../entities/status/types";
import { statusPath } from "../../entities/status/url";
import { TimelinePage } from "../timeline/TimelinePage";
import { TimelineRetention } from "../timeline/TimelineRetention";
import { TimelineShell } from "../timeline/TimelineShell";
import { home, local } from "../timeline/timelines";
import { ThreadPage } from "./ThreadPage";
import { preloadThread } from "./thread-query";

// happy-dom's IntersectionObserver constructs but never calls back (see
// TimelinePage.tsx's Sentinel); this fake stands in for the global so the
// tail-load trigger can be fired by hand.
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

  fireVisible(): void {
    this.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

// The sentinel the page mounted most recently — after a return trip that is
// the resumed page's own, not the disposed one's.
const currentSentinel = (): FakeIntersectionObserver => {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (observer === undefined) throw new Error("no sentinel is mounted");
  return observer;
};

const status = (id: string, body: string): Status => ({
  id,
  content: `<p>${body}</p>`,
  created_at: "2026-08-08T12:00:00.000Z",
  in_reply_to_id: null,
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

// A full 40-item page: exactly the server's clamp, which is what leaves the
// store willing to fetch more below it.
const firstPage: Status[] = Array.from({ length: 40 }, (_, i) => {
  const n = 40 - i;
  return status(`12000000000000${String(n).padStart(4, "0")}`, `Post ${n}`);
});
const olderPage: Status[] = [status("120000000000000000", "Older post")];

const THREAD_ID = "120000000000000040";

const homeRequests: URL[] = [];

const handlers = [
  http.get("*/api/v1/timelines/home", ({ request }) => {
    const url = new URL(request.url);
    homeRequests.push(url);
    return HttpResponse.json(
      url.searchParams.get("max_id") === null ? firstPage : olderPage,
    );
  }),
  http.get("*/api/v1/statuses/:id/context", () =>
    HttpResponse.json({ ancestors: [], descendants: [] }),
  ),
  http.get("*/api/v1/statuses/:id", () =>
    HttpResponse.json(status(THREAD_ID, "The post that was opened")),
  ),
];

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  query.clear();
  FakeIntersectionObserver.instances = [];
  homeRequests.length = 0;
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

// Mirrors App.tsx's route table: the retention provider wraps both the
// timeline shell and the thread, and the Suspense the thread falls into is the
// layout's, above the provider.
const AppChrome = (props: ParentProps) => (
  <>
    <A href={statusPath(THREAD_ID)}>Open thread</A>
    <A href={home.path} end>
      Back to home
    </A>
    <Suspense fallback={<p>Loading…</p>}>{props.children}</Suspense>
  </>
);

const renderApp = () => {
  const RetainingRoutes = (props: ParentProps) => (
    <TimelineRetention signedIn={true}>{props.children}</TimelineRetention>
  );
  return render(() => (
    <MemoryRouter root={AppChrome}>
      <Route component={RetainingRoutes}>
        <Route component={TimelineShell}>
          <Route
            path={home.path}
            component={() => <TimelinePage timeline={home} />}
          />
          <Route
            path={local.path}
            component={() => <TimelinePage timeline={local} />}
          />
        </Route>
        <Route
          path="/statuses/:id"
          component={ThreadPage}
          preload={preloadThread}
        />
      </Route>
    </MemoryRouter>
  ));
};

test("returning from a conversation shows the accumulated pages again, without refetching", async () => {
  server.use(...handlers);
  const { findByText, findByRole, queryByText } = renderApp();

  expect(await findByText("Post 40")).toBeInTheDocument();
  currentSentinel().fireVisible();
  expect(await findByText("Older post")).toBeInTheDocument();
  expect(await findByText("You're all caught up.")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);

  await userEvent.click(await findByRole("link", { name: "Open thread" }));
  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(queryByText("Post 40")).not.toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Back to home" }));

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(await findByText("Post 1")).toBeInTheDocument();
  expect(await findByText("Older post")).toBeInTheDocument();
  expect(await findByText("You're all caught up.")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
});

test("the timeline resumed after a conversation still loads older pages", async () => {
  // The canary for a store retained across the page that created it: its memos
  // would come back frozen, and the resumed sentinel would either stall or
  // fire without limit.
  server.use(...handlers);
  const { findByText, findByRole } = renderApp();

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);

  await userEvent.click(await findByRole("link", { name: "Open thread" }));
  expect(await findByText("The post that was opened")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Back to home" }));
  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);

  currentSentinel().fireVisible();

  expect(await findByText("Older post")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
  expect(homeRequests[1]?.searchParams.get("max_id")).toBe(
    "120000000000000001",
  );
});
