// @vitest-environment happy-dom
// What a profile keeps while the reader is off reading one of its posts, and
// what it must not keep. Page-level (ADR-0009): the retention stack is only
// observable through the page rebuilt on return — the accumulated posts are on
// screen again, the request log shows nothing was refetched, and the resumed
// list still pages on from its own tail.
import {
  A,
  createMemoryHistory,
  MemoryRouter,
  query,
  Route,
} from "@solidjs/router";
import { cleanup, render, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { type ParentProps, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { Retention } from "../../entities/retention/retention";
import { profilePath } from "../../entities/status/mention";
import type { Status } from "../../entities/status/types";
import { statusPath } from "../../entities/status/url";
import { ThreadPage } from "../thread/ThreadPage";
import { preloadThread } from "../thread/thread-query";
import { TimelinePage } from "../timeline/TimelinePage";
import { TimelineShell } from "../timeline/TimelineShell";
import { home } from "../timeline/timelines";
import { ProfilePage, ProfilePosts } from "./ProfilePage";
import type { Account } from "./profile-api";
import { preloadProfile } from "./profile-query";
import { posts } from "./profile-tabs";

// happy-dom's IntersectionObserver constructs but never calls back (see
// ProfilePage.tsx's PostsSentinel); this fake stands in for the global so the
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
// the resumed list's own, not the disposed one's.
const currentSentinel = (): FakeIntersectionObserver => {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (observer === undefined) throw new Error("no sentinel is mounted");
  return observer;
};

// Hand-written, anonymized fixtures typed against the generated schema
// (ADR-0002 amendment).
const ALICE_ACCT = "alice@fixture.example";

const alice: Account = {
  id: "900000000000000001",
  acct: ALICE_ACCT,
  display_name: "Alice Example",
  statuses_count: 200,
  following_count: 7,
  followers_count: 13,
};

const post = (id: string, body: string): Status => ({
  id,
  content: `<p>${body}</p>`,
  created_at: "2026-08-01T12:00:00.000Z",
  account: {
    id: alice.id ?? "",
    acct: ALICE_ACCT,
    display_name: alice.display_name ?? "",
  },
});

// Fixed-width ids so the descending numbering is also descending
// lexicographically, as flake ids are (docs/PLAN.ja.md, Akkoma pitfalls).
const idOf = (n: number): string =>
  `1200000000000${String(n).padStart(5, "0")}`;

const pageFrom = (top: number, length: number): Status[] =>
  Array.from({ length }, (_, i) => post(idOf(top - i), `Post ${top - i}`));

// The first two pages are exactly the server's clamp, which is what leaves the
// list willing to fetch below them; the third is short and settles the
// exhausted verdict (profile-api.ts).
const firstPage = pageFrom(120, 40);
const secondPage = pageFrom(80, 40);
const lastPage = pageFrom(40, 1);

const THREAD_ID = "120000000000009999";

// Every posts request, in order: "was this list refetched" is the whole point
// of these tests, and only the request log tells a resumed list from one that
// fetched the same posts again.
const postsRequests: URL[] = [];
const homeRequests: URL[] = [];

const accountHandler = http.get("*/api/v1/accounts/:id", () =>
  HttpResponse.json(alice),
);

const postsHandler = http.get(
  "*/api/v1/accounts/:id/statuses",
  ({ request }) => {
    const url = new URL(request.url);
    postsRequests.push(url);
    const maxId = url.searchParams.get("max_id");
    if (maxId === null) return HttpResponse.json(firstPage);
    return HttpResponse.json(maxId === idOf(81) ? secondPage : lastPage);
  },
);

const threadHandlers = [
  http.get("*/api/v1/statuses/:id/context", () =>
    HttpResponse.json({ ancestors: [], descendants: [] }),
  ),
  http.get("*/api/v1/statuses/:id", () =>
    HttpResponse.json(post(THREAD_ID, "The post that was opened")),
  ),
];

const timelineHandler = http.get("*/api/v1/timelines/home", ({ request }) => {
  homeRequests.push(new URL(request.url));
  return HttpResponse.json([post(idOf(500), "Home post")]);
});

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The query cache lives in the router module, not in the render tree, so an
  // account fetched by one test would answer the next one without a request.
  query.clear();
  FakeIntersectionObserver.instances = [];
  postsRequests.length = 0;
  homeRequests.length = 0;
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

// Stands in for the app chrome around the router outlet: the two ways out of
// wherever the reader is (an avatar tap and a card tap, in the real app). The
// way back is the browser's, driven here through the memory history.
const AppChrome = (props: ParentProps) => (
  <>
    <A href={profilePath(ALICE_ACCT)}>Open profile</A>
    <A href={statusPath(THREAD_ID)}>Open conversation</A>
    <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
  </>
);

// Mirrors App.tsx's route table: the retention provider is a pathless layout
// route wrapping the timeline shell, the profile and the conversation, so each
// trip takes the same path through the router the app takes.
const renderApp = (history = createMemoryHistory()) => {
  const RetainingRoutes = (props: ParentProps) => (
    <Retention signedIn={true}>{props.children}</Retention>
  );
  return render(() => (
    <MemoryRouter history={history} root={AppChrome}>
      <Route component={RetainingRoutes}>
        <Route component={TimelineShell}>
          <Route
            path={home.path}
            component={() => <TimelinePage timeline={home} />}
          />
        </Route>
        <Route
          path="/users/:acct"
          component={ProfilePage}
          preload={preloadProfile}
        >
          <Route
            path={posts.path}
            component={() => <ProfilePosts tab={posts} />}
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

/** A history already sitting on the profile, as a shared link would open it. */
const onProfile = () => {
  const history = createMemoryHistory();
  history.set({ value: profilePath(ALICE_ACCT), replace: true });
  return history;
};

test("returning from a conversation shows the profile's accumulated posts again, without refetching", async () => {
  server.use(accountHandler, postsHandler, ...threadHandlers);
  const history = onProfile();
  const { findByText, findByRole, queryByText } = renderApp(history);

  expect(await findByText("Post 120")).toBeInTheDocument();
  currentSentinel().fireVisible();
  expect(await findByText("Post 41")).toBeInTheDocument();
  expect(postsRequests).toHaveLength(2);

  await userEvent.click(
    await findByRole("link", { name: "Open conversation" }),
  );
  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(queryByText("Post 120")).not.toBeInTheDocument();

  history.back();

  expect(await findByText("Post 120")).toBeInTheDocument();
  expect(await findByText("Post 41")).toBeInTheDocument();
  expect(postsRequests).toHaveLength(2);

  // The canary for a store retained across the page that created it: its
  // signals would come back frozen and the resumed sentinel would either stall
  // or fire without limit.
  currentSentinel().fireVisible();

  expect(await findByText("Post 40")).toBeInTheDocument();
  expect(postsRequests).toHaveLength(3);
  // Anchored at the retained tail, so the resumed list paged on from where the
  // disposed one left off rather than from a rebuilt head.
  expect(postsRequests[2]?.searchParams.get("max_id")).toBe(idOf(41));
  expect(await findByText("No more posts.")).toBeInTheDocument();
});

test("a timeline, a profile opened from it and a conversation opened from that all come back, each fetched once", async () => {
  server.use(accountHandler, postsHandler, timelineHandler, ...threadHandlers);
  const history = createMemoryHistory();
  const { findByText, findByRole, queryByText } = renderApp(history);

  expect(await findByText("Home post")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);

  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("Post 120")).toBeInTheDocument();
  expect(postsRequests).toHaveLength(1);

  await userEvent.click(
    await findByRole("link", { name: "Open conversation" }),
  );
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  history.back();

  expect(await findByText("Post 120")).toBeInTheDocument();
  expect(postsRequests).toHaveLength(1);
  expect(queryByText("Home post")).not.toBeInTheDocument();

  history.back();

  // The profile's frame never displaced the timeline's: both entries are still
  // in the stack, so the second pop lands on content too.
  expect(await findByText("Home post")).toBeInTheDocument();
  expect(homeRequests).toHaveLength(1);
  expect(queryByText("Post 120")).not.toBeInTheDocument();
});

test("pushing the same profile again from inside a conversation leaves the first visit reachable", async () => {
  // The conversation between the two visits takes a frame of its own even
  // though it holds no snapshot. Without it the stack would hold two frames
  // for one path with nothing between them, and the pop meant for the first
  // visit would land on the second (src/entities/retention/retention.tsx).
  let visits = 0;
  server.use(
    accountHandler,
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      postsRequests.push(new URL(request.url));
      visits += 1;
      return HttpResponse.json([
        visits === 1
          ? post(idOf(120), "Post from the first visit")
          : post(idOf(119), "Post from the second visit"),
      ]);
    }),
    ...threadHandlers,
  );
  const history = onProfile();
  const { findByText, findByRole, queryByText } = renderApp(history);

  expect(await findByText("Post from the first visit")).toBeInTheDocument();

  await userEvent.click(
    await findByRole("link", { name: "Open conversation" }),
  );
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("Post from the second visit")).toBeInTheDocument();
  // A push is a fresh visit however often the path has been visited before.
  expect(postsRequests).toHaveLength(2);

  history.back();
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  history.back();

  expect(await findByText("Post from the first visit")).toBeInTheDocument();
  expect(queryByText("Post from the second visit")).not.toBeInTheDocument();
  expect(postsRequests).toHaveLength(2);
});

test("walking deeper into a conversation still leaves the profile visit it started from reachable", async () => {
  // Opening a post from inside a conversation moves `:id` without recreating
  // the page, so the second conversation takes a frame of its own only because
  // ThreadPage.tsx marks one per arrival rather than per mount. Without that
  // frame the three steps back run out of stack an entry early and the pop
  // meant for the first profile visit lands on the second.
  const DEEPER_ID = "120000000000009998";
  const opened = post(THREAD_ID, "The post that was opened");
  const deeper: Status = {
    ...post(DEEPER_ID, "The reply it was walked into"),
    in_reply_to_id: THREAD_ID,
  };
  let visits = 0;
  server.use(
    accountHandler,
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      postsRequests.push(new URL(request.url));
      visits += 1;
      return HttpResponse.json([
        visits === 1
          ? post(idOf(120), "Post from the first visit")
          : post(idOf(119), "Post from the second visit"),
      ]);
    }),
    http.get<{ id: string }>("*/api/v1/statuses/:id/context", ({ params }) =>
      HttpResponse.json(
        params.id === THREAD_ID
          ? { ancestors: [], descendants: [deeper] }
          : { ancestors: [opened], descendants: [] },
      ),
    ),
    http.get<{ id: string }>("*/api/v1/statuses/:id", ({ params }) =>
      HttpResponse.json(params.id === THREAD_ID ? opened : deeper),
    ),
  );
  const history = onProfile();
  const view = renderApp(history);
  // Both conversations draw both posts — one as the subject, the other as a
  // neighbouring row — so only the landing mark says which one is on screen.
  const landedOn = (body: string) =>
    waitFor(() =>
      expect(
        view.container.querySelector('[aria-current="true"]'),
      ).toHaveTextContent(body),
    );

  expect(
    await view.findByText("Post from the first visit"),
  ).toBeInTheDocument();

  await userEvent.click(
    await view.findByRole("link", { name: "Open conversation" }),
  );
  await landedOn("The post that was opened");

  const row = [...view.container.querySelectorAll("li")].find((item) =>
    item.textContent?.includes("The reply it was walked into"),
  );
  if (row === undefined) throw new Error("the reply row is missing");
  await userEvent.click(
    within(row).getByRole("link", { name: /Conversation/ }),
  );
  await landedOn("The reply it was walked into");

  await userEvent.click(
    await view.findByRole("link", { name: "Open profile" }),
  );
  expect(
    await view.findByText("Post from the second visit"),
  ).toBeInTheDocument();
  expect(postsRequests).toHaveLength(2);

  history.back();
  await landedOn("The reply it was walked into");

  history.back();
  await landedOn("The post that was opened");

  history.back();

  expect(
    await view.findByText("Post from the first visit"),
  ).toBeInTheDocument();
  expect(
    view.queryByText("Post from the second visit"),
  ).not.toBeInTheDocument();
  expect(postsRequests).toHaveLength(2);
});
