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
import { ProfilePage } from "./ProfilePage";
import type { Account } from "./profile-api";
import { preloadProfile } from "./profile-query";

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

// Mirrors App.tsx: the profile is a leaf route with the preload attached, and
// the Suspense boundary the page's pending state falls into belongs to the
// layout above it, not to the page. The fallback text is deliberately not the
// page's own "Loading…" row, so the two are distinguishable in assertions.
const Chrome = (props: ParentProps) => (
  <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
);

const renderProfile = (acct: string) => {
  const history = createMemoryHistory();
  history.set({ value: `/users/${acct}`, replace: true });
  return {
    history,
    ...render(() => (
      <MemoryRouter history={history} root={Chrome}>
        <Route
          path="/users/:acct"
          component={ProfilePage}
          preload={preloadProfile}
        />
      </MemoryRouter>
    )),
  };
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
  const { findByText, findByRole, container } = renderProfile(ALICE_ACCT);

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

test("renders an empty-success row and no sentinel when the account has no posts", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", () => HttpResponse.json([])),
  );
  const { findByText } = renderProfile(ALICE_ACCT);

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
  const { findByText } = renderProfile(ALICE_ACCT);

  expect(await findByText("Full page item 39")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  expect(await findByText("Older page item 1")).toBeInTheDocument();
  // The first page is untouched by the tail-ward fetch.
  expect(await findByText("Full page item 39")).toBeInTheDocument();
  // The short second page proves nothing older remains, and the quiet end
  // marker replaces the sentinel.
  expect(await findByText(/all caught up/i)).toBeInTheDocument();
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
  const { findByText, findByRole } = renderProfile(ALICE_ACCT);

  expect(await findByText("Full page item 39")).toBeInTheDocument();

  FakeIntersectionObserver.instances.at(-1)?.fireVisible();

  // role="alert" so the failure is announced, not merely painted.
  expect(await findByRole("alert")).toHaveTextContent(/couldn't load more/i);

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("Recovered page")).toBeInTheDocument();
  // The retry resumes from the same cursor, so no post is skipped over.
  expect(requestedMaxIds).toEqual([fullPageTailId, fullPageTailId]);
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
  const { findByRole, queryByRole } = renderProfile("ghost@fixture.example");

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
  const { findByText, findByRole, queryByText } = renderProfile(ALICE_ACCT);

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
  const { history, findByText, queryByText } = renderProfile(ALICE_ACCT);

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
