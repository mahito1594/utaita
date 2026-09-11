// @vitest-environment happy-dom
import {
  createMemoryHistory,
  MemoryRouter,
  query,
  Route,
} from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { type ParentProps, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Status } from "../../entities/status/types";
import { ProfilePage, ProfilePosts } from "./ProfilePage";
import type { Account } from "./profile-api";
import { preloadProfile } from "./profile-query";
import {
  media,
  posts,
  postsAndReplies,
  profileTabPath,
  profileTabs,
} from "./profile-tabs";

// happy-dom's IntersectionObserver constructs but never actually calls back
// (see ProfilePage.tsx's PostsSentinel) — this fake stands in for the global so
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
const ALICE_ACCT = "alice@fixture.example";
const BOB_ACCT = "bob";

const alice: Account = {
  id: "900000000000000001",
  acct: ALICE_ACCT,
  display_name: "Alice Example",
  note: "<p>Bio of Alice</p>",
  fields: [
    { name: "Site", value: '<a href="https://example.test">example.test</a>' },
  ],
  statuses_count: 42,
  following_count: 7,
  followers_count: 13,
};

const bob: Account = {
  id: "900000000000000002",
  acct: BOB_ACCT,
  display_name: "Bob Local",
  statuses_count: 1,
  following_count: 0,
  followers_count: 0,
};

// Descending ids, like every real page — flake IDs are lexicographically
// comparable, and a newer status carries a larger id (docs/PLAN.ja.md, Akkoma
// pitfalls).
const post = (id: string, body: string, author: Account = alice): Status => ({
  id,
  content: `<p>${body}</p>`,
  created_at: "2026-08-01T12:00:00.000Z",
  account: {
    id: author.id ?? "",
    acct: author.acct ?? "",
    display_name: author.display_name ?? "",
  },
});

const alicePosts: Status[] = [
  post("110000000000000002", "Alice's newer post"),
  post("110000000000000001", "Alice's older post"),
];

// Exactly at the server's clamp: a page this long cannot rule out more posts
// below it, so it is what keeps the sentinel mounted (profile-api.ts).
const fullPage: Status[] = Array.from({ length: 40 }, (_, i) => {
  const suffix = 39 - i;
  return post(
    `12000000000000${String(suffix).padStart(4, "0")}`,
    `Full page item ${suffix}`,
  );
});
const fullPageTailId = fullPage.at(-1)?.id;

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
  // The query cache lives in the router module, not in the render tree, so an
  // account fetched by one test would answer the next one without a request.
  query.clear();
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

// Mirrors App.tsx: the profile is a layout route with the preload attached
// and one leaf per tab, and the Suspense boundary the page's pending state
// falls into belongs to the layout above it, not to the page. The fallback
// text is deliberately not the page's own "Loading…" row, so the two are
// distinguishable in assertions.
const Chrome = (props: ParentProps) => (
  <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
);

const renderProfile = (path: string) => {
  const history = createMemoryHistory();
  history.set({ value: path, replace: true });
  return {
    history,
    ...render(() => (
      <MemoryRouter history={history} root={Chrome}>
        <Route
          path="/users/:acct"
          component={ProfilePage}
          preload={preloadProfile}
        >
          <Route
            path={posts.path}
            component={() => <ProfilePosts tab={posts} />}
          />
          <Route
            path={postsAndReplies.path}
            component={() => <ProfilePosts tab={postsAndReplies} />}
          />
          <Route
            path={media.path}
            component={() => <ProfilePosts tab={media} />}
          />
        </Route>
      </MemoryRouter>
    )),
  };
};

/**
 * A response the test releases by hand: the handler awaits this promise, so an
 * answer can be left in flight across a navigation and delivered afterwards.
 */
const deferred = () => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  return { held, release };
};

/** Lets the router's transition and the effects behind it run to completion. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

test("renders the identity block over the account's posts", async () => {
  let postsUrl: URL | undefined;
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      postsUrl = new URL(request.url);
      return HttpResponse.json(alicePosts);
    }),
  );
  const { findByText, findByRole, container } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  const name = await findByRole("heading", { level: 2 });
  expect(name).toHaveTextContent("Alice Example");

  // The handle, bio, fields and counts all belong to the identity block; the
  // cards below repeat the author's handle, so the assertions are scoped to
  // the header element rather than to the page.
  const header = container.querySelector("header");
  expect(header).toHaveTextContent(`@${ALICE_ACCT}`);
  expect(header).toHaveTextContent("Bio of Alice");
  expect(header).toHaveTextContent("Site");
  expect(header).toHaveTextContent("example.test");
  expect(header).toHaveTextContent("42 posts");
  expect(header).toHaveTextContent("7 following");
  expect(header).toHaveTextContent("13 followers");

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(await findByText("Alice's older post")).toBeInTheDocument();

  // This list is "posts", not "posts and replies", and the first page starts
  // at the top of the account's history.
  expect(postsUrl?.searchParams.get("exclude_replies")).toBe("true");
  expect(postsUrl?.searchParams.get("max_id")).toBeNull();
});

test("the account is fetched with the viewer's relationship and shows it as badges", async () => {
  let accountUrl: URL | undefined;
  const mutual: Account = {
    ...alice,
    pleroma: { relationship: { following: true, followed_by: true } },
  };
  server.use(
    http.get("*/api/v1/accounts/:id", ({ request }) => {
      accountUrl = new URL(request.url);
      return HttpResponse.json(mutual);
    }),
    http.get("*/api/v1/accounts/:id/statuses", () =>
      HttpResponse.json(alicePosts),
    ),
  );
  const { findByText, container } = renderProfile(`/users/${ALICE_ACCT}`);

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(accountUrl?.searchParams.get("with_relationships")).toBe("true");
  const header = container.querySelector("header");
  expect(header).toHaveTextContent("Following");
  expect(header).toHaveTextContent("Follows you");
});

test("each badge follows its own flag", async () => {
  // The two pills sit behind one shared gate; only a one-sided relationship
  // can tell a pill wired to the wrong flag from a correct one.
  const cases: [Account, string, string][] = [
    [
      { ...alice, pleroma: { relationship: { following: true } } },
      "Following",
      "Follows you",
    ],
    [
      { ...alice, pleroma: { relationship: { followed_by: true } } },
      "Follows you",
      "Following",
    ],
  ];
  for (const [account, shown, hidden] of cases) {
    server.use(
      http.get("*/api/v1/accounts/:id", () => HttpResponse.json(account)),
      http.get("*/api/v1/accounts/:id/statuses", () =>
        HttpResponse.json(alicePosts),
      ),
    );
    const { findByText, container, unmount } = renderProfile(
      `/users/${ALICE_ACCT}`,
    );
    expect(await findByText("Alice's newer post")).toBeInTheDocument();
    const header = container.querySelector("header");
    expect(header).toHaveTextContent(shown);
    expect(header).not.toHaveTextContent(hidden);
    unmount();
    query.clear();
  }
});

test("no relationship, or an all-false one, shows no badge", async () => {
  // Anonymous viewers get every flag false; `null` is the shape without
  // `with_relationships`, kept here so a payload that lacks it stays quiet.
  const strangers: Account[] = [
    { ...alice, pleroma: { relationship: { following: false } } },
    { ...alice, pleroma: { relationship: null } },
  ];
  for (const stranger of strangers) {
    server.use(
      http.get("*/api/v1/accounts/:id", () => HttpResponse.json(stranger)),
      http.get("*/api/v1/accounts/:id/statuses", () =>
        HttpResponse.json(alicePosts),
      ),
    );
    const { findByText, container, unmount } = renderProfile(
      `/users/${ALICE_ACCT}`,
    );
    expect(await findByText("Alice's newer post")).toBeInTheDocument();
    const header = container.querySelector("header");
    expect(header).not.toHaveTextContent("Following");
    expect(header).not.toHaveTextContent("Follows you");
    unmount();
    query.clear();
  }
});

test("counts the account withholds are absent, not zeroes", async () => {
  // `hide_follows_count` / `hide_followers_count` are the account's own
  // settings; Akkoma still sends the numbers next to them. `statuses_count`
  // has no such switch, so its absence here is the payload simply not carrying
  // one.
  const shy: Account = {
    id: "900000000000000001",
    acct: ALICE_ACCT,
    display_name: "Alice Example",
    following_count: 7,
    followers_count: 13,
    pleroma: { hide_follows_count: true, hide_followers_count: true },
  };
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(shy)),
    http.get("*/api/v1/accounts/:id/statuses", () =>
      HttpResponse.json(alicePosts),
    ),
  );
  const { findByRole, container } = renderProfile(`/users/${ALICE_ACCT}`);

  await findByRole("heading", { level: 2 });
  const header = container.querySelector("header");
  expect(header).not.toHaveTextContent("following");
  expect(header).not.toHaveTextContent("followers");
  expect(header).not.toHaveTextContent("posts");
  expect(header).not.toHaveTextContent("0");
});

test("renders an empty-success row and no sentinel when the account has no posts", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", () => HttpResponse.json([])),
  );
  const { findByText } = renderProfile(`/users/${ALICE_ACCT}`);

  expect(await findByText(/no posts yet/i)).toBeInTheDocument();
  // Nothing to page from: the sentinel is never mounted, so it never observes.
  expect(FakeIntersectionObserver.instances).toHaveLength(0);
});

test("a scroll-triggered sentinel appends the next page and stops at a short one", async () => {
  const olderPage: Status[] = [
    post("119999999999999999", "Older page item 1"),
    post("119999999999999998", "Older page item 0"),
  ];
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(fullPage);
      expect(maxId).toBe(fullPageTailId);
      return HttpResponse.json(olderPage);
    }),
  );
  const { findByText } = renderProfile(`/users/${ALICE_ACCT}`);

  expect(await findByText("Full page item 39")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  expect(await findByText("Older page item 1")).toBeInTheDocument();
  // The first page is untouched by the tail-ward fetch.
  expect(await findByText("Full page item 39")).toBeInTheDocument();
  // The short second page proves nothing older remains, and the quiet end
  // marker replaces the sentinel.
  expect(await findByText(/no more posts/i)).toBeInTheDocument();
});

test("an older-page failure offers a retry that repeats the same request", async () => {
  const requestedMaxIds: string[] = [];
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      if (maxId === null) return HttpResponse.json(fullPage);
      requestedMaxIds.push(maxId);
      if (requestedMaxIds.length === 1) return HttpResponse.error();
      return HttpResponse.json([post("119999999999999999", "Recovered page")]);
    }),
  );
  const { findByText, findByRole } = renderProfile(`/users/${ALICE_ACCT}`);

  expect(await findByText("Full page item 39")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  // role="alert" so the failure is announced, not merely painted.
  expect(await findByRole("alert")).toHaveTextContent(/couldn't load more/i);

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("Recovered page")).toBeInTheDocument();
  // The retry resumes from the same cursor, so no post is skipped over.
  expect(requestedMaxIds).toEqual([fullPageTailId, fullPageTailId]);
});

test("a retry that fails again leaves the reader's focus on the Retry button", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      const maxId = new URL(request.url).searchParams.get("max_id");
      return maxId === null
        ? HttpResponse.json(fullPage)
        : HttpResponse.error();
    }),
  );
  const { findByText, findByRole } = renderProfile(`/users/${ALICE_ACCT}`);

  expect(await findByText("Full page item 39")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  const retryButton = await findByRole("button", { name: "Retry" });
  await userEvent.click(retryButton);
  expect(document.activeElement).toBe(retryButton);

  // The second failure has to reach the page as one update: pressing Retry
  // again is the only way forward, so the button it is pressed with must not
  // be unmounted and rebuilt underneath the reader in between.
  expect(await findByRole("alert")).toHaveTextContent(/couldn't load more/i);
  expect(document.activeElement).toBe(retryButton);
});

test("an account this instance does not have renders an error and asks for no posts", async () => {
  let postsRequestCount = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () =>
      HttpResponse.json({ error: "Record not found" }, { status: 404 }),
    ),
    http.get("*/api/v1/accounts/:id/statuses", () => {
      postsRequestCount += 1;
      return HttpResponse.json([]);
    }),
  );
  const { findByRole, queryByRole } = renderProfile(
    "/users/ghost@fixture.example",
  );

  expect(await findByRole("alert")).toHaveTextContent(/not on this instance/i);
  // A 404 is the one answer repeating the request cannot change.
  expect(queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

  // No account, no list: the posts endpoint is never reached.
  await settle();
  expect(postsRequestCount).toBe(0);
});

test("a failed account fetch offers a retry that revalidates and succeeds", async () => {
  let accountRequestCount = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () => {
      accountRequestCount += 1;
      if (accountRequestCount === 1) return HttpResponse.error();
      return HttpResponse.json(alice);
    }),
    http.get("*/api/v1/accounts/:id/statuses", () =>
      HttpResponse.json(alicePosts),
    ),
  );
  const { findByText, findByRole, queryByText } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  expect(await findByText(/connection failed/i)).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  // The cached failure is a value like any other answer, so recovery is a
  // revalidation of the query key rather than a plain re-call.
  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );
  expect(queryByText(/connection failed/i)).not.toBeInTheDocument();
  expect(accountRequestCount).toBe(2);
});

test("a first page of posts that fails leaves the header standing and recovers on retry", async () => {
  let postsRequestCount = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", () => {
      postsRequestCount += 1;
      if (postsRequestCount === 1) {
        return HttpResponse.json(
          { error: "Something went wrong" },
          { status: 500 },
        );
      }
      return HttpResponse.json(alicePosts);
    }),
  );
  const { findByText, findByRole, queryByText } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  // Only the list failed, so the account's own copy is not what is said.
  expect(await findByRole("alert")).toHaveTextContent(
    /couldn't load this account's posts/i,
  );
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(queryByText(/couldn't load this account's posts/i)).toBeNull();
  // Recovery is the same first-page call again — the account is not refetched.
  expect(postsRequestCount).toBe(2);
});

test("a first-page retry that fails again leaves focus on its Retry button", async () => {
  // Same contract as the sentinel's Retry: a failed request is a new error
  // object, and the card must update in place rather than be rebuilt around
  // it, or the button being pressed vanishes under the reader.
  let postsRequestCount = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", () => {
      postsRequestCount += 1;
      // A different status the second time, so the copy changing is what
      // proves the second answer has landed — the card shows no in-flight
      // state of its own.
      return HttpResponse.json(
        { error: "Something went wrong" },
        { status: postsRequestCount === 1 ? 500 : 503 },
      );
    }),
  );
  const { findByRole } = renderProfile(`/users/${ALICE_ACCT}`);

  const retryButton = await findByRole("button", { name: "Retry" });
  await userEvent.click(retryButton);
  expect(document.activeElement).toBe(retryButton);

  // Two failures, one card: the copy updates in place and the same element
  // is still the one focused.
  await vi.waitFor(() => expect(postsRequestCount).toBe(2));
  expect(await findByRole("alert")).toHaveTextContent(/posts \(503\)/);
  expect(await findByRole("button", { name: "Retry" })).toBe(retryButton);
  expect(document.activeElement).toBe(retryButton);
});

test("an account retry that comes back 404 withdraws Retry without rebuilding the card", async () => {
  // The one behavior keying on the error value used to buy (TimelinePage.tsx
  // records it shipping broken once): the Retry offer must follow the error's
  // kind even though the card itself is not recreated.
  let accountRequestCount = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () => {
      accountRequestCount += 1;
      if (accountRequestCount === 1) return HttpResponse.error();
      return HttpResponse.json({ error: "Record not found" }, { status: 404 });
    }),
    http.get("*/api/v1/accounts/:id/statuses", () => HttpResponse.json([])),
  );
  const { findByRole, queryByRole } = renderProfile(`/users/${ALICE_ACCT}`);

  const alert = await findByRole("alert");
  expect(alert).toHaveTextContent(/connection failed/i);
  await userEvent.click(await findByRole("button", { name: "Retry" }));

  await vi.waitFor(() =>
    expect(alert).toHaveTextContent(/not on this instance/i),
  );
  expect(queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});

test("changing only :acct leaves none of the previous account's posts behind", async () => {
  // A change of `:acct` alone does not remount the route, so the posts of the
  // account being left have to be taken off the page by the profile body being
  // rebuilt around a fresh store (ProfilePage.tsx).
  server.use(
    http.get<{ id: string }>("*/api/v1/accounts/:id", ({ params }) =>
      HttpResponse.json(params.id === BOB_ACCT ? bob : alice),
    ),
    http.get<{ id: string }>("*/api/v1/accounts/:id/statuses", ({ params }) =>
      HttpResponse.json(
        params.id === BOB_ACCT
          ? [post("110000000000000003", "Bob's only post", bob)]
          : alicePosts,
      ),
    ),
  );
  const { history, findByText, queryByText } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  expect(await findByText("Alice's newer post")).toBeInTheDocument();

  history.set({ value: `/users/${BOB_ACCT}` });

  expect(await findByText("Bob's only post")).toBeInTheDocument();
  expect(queryByText("Alice's newer post")).not.toBeInTheDocument();
  expect(queryByText("Alice's older post")).not.toBeInTheDocument();

  // And back, with both accounts now in the query cache — the leg a reader
  // takes by pressing Back, and the one where the account answer is already
  // there when the URL changes.
  history.set({ value: `/users/${ALICE_ACCT}` });

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(queryByText("Bob's only post")).not.toBeInTheDocument();
});

test("a page of the previous account's posts that lands after the :acct changed is dropped", async () => {
  // The first page for Alice is still out when Bob's URL takes over. It is the
  // body being rebuilt around a fresh store that makes the answer harmless:
  // nothing cancels the request, and its result has nowhere to go.
  const alicePostsHeld = deferred();
  server.use(
    http.get<{ id: string }>("*/api/v1/accounts/:id", ({ params }) =>
      HttpResponse.json(params.id === BOB_ACCT ? bob : alice),
    ),
    http.get<{ id: string }>(
      "*/api/v1/accounts/:id/statuses",
      async ({ params }) => {
        if (params.id === BOB_ACCT) {
          return HttpResponse.json([
            post("110000000000000003", "Bob's only post", bob),
          ]);
        }
        await alicePostsHeld.held;
        return HttpResponse.json(alicePosts);
      },
    ),
  );
  const { history, findByText, findByRole, queryByText } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  // Alice's header is up and her posts are in flight, held.
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );

  history.set({ value: `/users/${BOB_ACCT}` });

  expect(await findByText("Bob's only post")).toBeInTheDocument();

  alicePostsHeld.release();
  await settle();

  expect(queryByText("Alice's newer post")).not.toBeInTheDocument();
  expect(queryByText("Alice's older post")).not.toBeInTheDocument();
  expect(queryByText("Bob's only post")).toBeInTheDocument();
});

test("the tab bar links every tab and marks only the current one", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", () =>
      HttpResponse.json(alicePosts),
    ),
  );
  const { findByRole, findByText } = renderProfile(`/users/${ALICE_ACCT}`);

  // Settled first: the list's request must not still be in flight when the
  // next test installs its own handlers.
  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  const nav = await findByRole("navigation", { name: "Profile sections" });
  const links = Array.from(nav.querySelectorAll("a"));
  expect(links.map((link) => link.getAttribute("href"))).toEqual(
    profileTabs.map((tab) => profileTabPath(ALICE_ACCT, tab)),
  );
  // `<A>` marks an exact match only, so the Posts tab's shorter path is not
  // current on the other two tabs' URLs.
  expect(
    links.map((link) => [link.textContent, link.getAttribute("aria-current")]),
  ).toEqual([
    ["Posts", "page"],
    ["Posts & replies", null],
    ["Media", null],
  ]);
});

test("the replies and media tabs send their own filters", async () => {
  const requested: URL[] = [];
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      requested.push(new URL(request.url));
      return HttpResponse.json(alicePosts);
    }),
  );

  const replies = renderProfile(`/users/${ALICE_ACCT}/with_replies`);
  expect(await replies.findByText("Alice's newer post")).toBeInTheDocument();
  // No filter at all: replies are in, and so is everything else.
  expect(requested[0]?.searchParams.get("exclude_replies")).toBeNull();
  expect(requested[0]?.searchParams.get("only_media")).toBeNull();
  expect(
    replies.container.querySelector("a[aria-current=page]")?.textContent,
  ).toBe("Posts & replies");
  replies.unmount();

  const mediaTab = renderProfile(`/users/${ALICE_ACCT}/media`);
  expect(await mediaTab.findByText("Alice's newer post")).toBeInTheDocument();
  expect(requested[1]?.searchParams.get("only_media")).toBe("true");
  expect(requested[1]?.searchParams.get("exclude_replies")).toBeNull();
});

test("activating a tab refetches under its filter, keeps the account, and keeps focus on the tab", async () => {
  let accountRequestCount = 0;
  const requested: URL[] = [];
  server.use(
    http.get("*/api/v1/accounts/:id", () => {
      accountRequestCount += 1;
      return HttpResponse.json(alice);
    }),
    http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
      const url = new URL(request.url);
      requested.push(url);
      return HttpResponse.json(
        url.searchParams.get("only_media") === "true"
          ? [post("110000000000000005", "Alice's picture")]
          : alicePosts,
      );
    }),
  );
  const { findByText, findByRole, queryByText } = renderProfile(
    `/users/${ALICE_ACCT}`,
  );

  expect(await findByText("Alice's newer post")).toBeInTheDocument();

  const mediaTab = await findByRole("link", { name: "Media" });
  await userEvent.click(mediaTab);

  // The list is rebuilt around a fresh store, so nothing of the previous tab
  // survives; the header above it stays, served from the query cache.
  expect(await findByText("Alice's picture")).toBeInTheDocument();
  expect(queryByText("Alice's newer post")).not.toBeInTheDocument();
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );
  expect(requested.map((url) => url.searchParams.get("only_media"))).toEqual([
    null,
    "true",
  ]);
  expect(accountRequestCount).toBe(1);

  // The nav is keyed on the acct, not on the tab, so the activated link is
  // the same element and still holds focus (the timeline switcher's contract,
  // TimelinePage.switching.test.tsx).
  expect(mediaTab).toHaveAttribute("aria-current", "page");
  expect(await findByRole("link", { name: "Posts" })).not.toHaveAttribute(
    "aria-current",
  );
  expect(document.activeElement).toBe(mediaTab);
  expect(await findByRole("link", { name: "Media" })).toBe(mediaTab);
});
