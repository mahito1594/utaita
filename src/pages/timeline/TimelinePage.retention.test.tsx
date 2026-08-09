// @vitest-environment happy-dom
// What survives leaving the timeline and coming back. The retention slot is
// only observable through the page rebuilt on return, so these are page-level
// tests (ADR-0009): the accumulated pages are still on screen, no request was
// re-issued, and the resumed page can still load older content — the last one
// being the canary for a store held across the disposal of the page that
// created it, whose memos would come back frozen.
import { A, MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { createSignal, type ParentProps } from "solid-js";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { ProfilePage } from "../profile/ProfilePage";
import { TimelinePage } from "./TimelinePage";
import { TimelineRetention } from "./TimelineRetention";
import { TimelineShell } from "./TimelineShell";
import { home, local } from "./timelines";

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

const status = (id: string, content: string): Status => ({
  id,
  content: `<p>${content}</p>`,
  created_at: "2026-08-08T12:00:00.000Z",
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

// A full 40-item page: exactly the server's clamp, which is what leaves the
// store willing to fetch more below it. Newest-first (descending ids), like
// every real page — flake IDs are lexicographically comparable
// (docs/PLAN.ja.md, Akkoma pitfalls).
const firstPage: Status[] = Array.from({ length: 40 }, (_, i) => {
  const n = 40 - i;
  return status(`12000000000000${String(n).padStart(4, "0")}`, `Post ${n}`);
});

// Sorts below every id in `firstPage`, and short enough (1 < 40) to settle
// the store's `exhausted` verdict — the part of the snapshot that is not
// statuses.
const olderPage: Status[] = [status("120000000000000000", "Older post")];

// Every request the home timeline made, in order: "was this content
// refetched" is the whole point of these tests, and only the request log can
// tell a resumed page from a page that fetched the same thing again.
const homeRequests: URL[] = [];

const timelineHandlers = [
  http.get("*/api/v1/timelines/home", ({ request }) => {
    const url = new URL(request.url);
    homeRequests.push(url);
    return HttpResponse.json(
      url.searchParams.get("max_id") === null ? firstPage : olderPage,
    );
  }),
  http.get("*/api/v1/timelines/public", () =>
    HttpResponse.json([status("119999999999999999", "Local post")]),
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
  FakeIntersectionObserver.instances = [];
  homeRequests.length = 0;
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

// Stands in for the app chrome around the router outlet: a way out of the
// timeline (a mention tap, in the real app) and a way back that does not
// live inside the timeline shell — the shell is gone while a detail route is
// showing.
const AppChrome = (props: ParentProps) => (
  <>
    <A href="/users/alice">Open profile</A>
    <A href={home.path} end>
      Back to home
    </A>
    {props.children}
  </>
);

// Mirrors App.tsx's route table: the retention provider is a pathless layout
// route wrapping both the timeline shell and the detail route, so leaving for
// a profile and coming back takes the same path through the router the app
// takes.
const renderApp = (signedIn: () => boolean = () => true) => {
  const RetainingRoutes = (props: ParentProps) => (
    <TimelineRetention signedIn={signedIn()}>
      {props.children}
    </TimelineRetention>
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
        <Route path="/users/:acct" component={ProfilePage} />
      </Route>
    </MemoryRouter>
  ));
};

test("returning from a profile shows the accumulated pages again, without refetching", async () => {
  server.use(...timelineHandlers);
  const { findByText, findByRole, queryByText } = renderApp();

  expect(await findByText("Post 40")).toBeInTheDocument();
  currentSentinel().fireVisible();
  expect(await findByText("Older post")).toBeInTheDocument();
  // The short tail page settled the exhausted verdict, so the sentinel is
  // replaced by the caught-up row.
  expect(await findByText("You're all caught up.")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);

  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("@alice")).toBeInTheDocument();
  expect(queryByText("Post 40")).not.toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Back to home" }));

  // Both pages are back, in order, and nothing went to the network for them.
  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(await findByText("Post 1")).toBeInTheDocument();
  expect(await findByText("Older post")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
  // `exhausted` rode along in the snapshot: the resumed store does not have
  // to prove the tail again with a fetch it already made.
  expect(await findByText("You're all caught up.")).toBeInTheDocument();
});

test("the resumed timeline still loads older pages", async () => {
  // The canary for retaining a live store instead of a snapshot: its memos
  // would belong to the disposed page and come back frozen, so the resumed
  // sentinel would read a stale `loadingOlder` and either stall forever or
  // fire without limit.
  server.use(...timelineHandlers);
  const { findByText, findByRole } = renderApp();

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);

  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("@alice")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Back to home" }));
  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);

  currentSentinel().fireVisible();

  expect(await findByText("Older post")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
  // Anchored at the retained tail, so the resumed store paged on from where
  // the disposed one left off rather than from a rebuilt head.
  expect(homeRequests[1]?.searchParams.get("max_id")).toBe(
    "120000000000000001",
  );
});

test("switching tabs still starts the timeline switched to from a fresh fetch", async () => {
  // One slot, replaced on a switch: a per-path map would answer the return
  // trip with old content and no fetch, which for a push navigation (no
  // scroll restoration) is worse than the refetch it replaced.
  server.use(...timelineHandlers);
  const { findByText, findByRole, queryByText } = renderApp();

  expect(await findByText("Post 40")).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Local" }));
  expect(await findByText("Local post")).toBeInTheDocument();
  expect(queryByText("Post 40")).not.toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Home" }));

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
  expect(queryByText("Local post")).not.toBeInTheDocument();
});

test("a timeline retained on the way out is dropped when the session ends", async () => {
  // The gate above the provider is a non-keyed `<Show>`, so structural
  // disposal is not what may be relied on to clear the slot: the provider
  // drops it on the session signal itself.
  server.use(...timelineHandlers);
  const [signedIn, setSignedIn] = createSignal(true);
  const { findByText, findByRole } = renderApp(signedIn);

  expect(await findByText("Post 40")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("@alice")).toBeInTheDocument();

  setSignedIn(false);
  await userEvent.click(await findByRole("link", { name: "Back to home" }));

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(2);
});
