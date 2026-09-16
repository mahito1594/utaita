// @vitest-environment happy-dom
import {
  createMemoryHistory,
  MemoryRouter,
  query,
  Route,
} from "@solidjs/router";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { type ParentProps, Suspense } from "solid-js";
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  onTestFinished,
  test,
} from "vitest";
import type { Status } from "../../entities/status/types";
import { ProfilePage, ProfilePosts } from "./ProfilePage";
import type { Account } from "./profile-api";
import { preloadProfile } from "./profile-query";
import {
  media,
  type ProfileTab,
  posts,
  postsAndReplies,
  profileTabPath,
} from "./profile-tabs";

// Hand-written, anonymized fixtures typed against the generated schema
// (ADR-0002 amendment).
const ALICE_ACCT = "alice@fixture.example";

const alice: Account = {
  id: "900000000000000001",
  acct: ALICE_ACCT,
  display_name: "Alice Example",
  statuses_count: 42,
};

const post = (id: string, body: string): Status => ({
  id,
  content: `<p>${body}</p>`,
  created_at: "2026-08-01T12:00:00.000Z",
  account: {
    id: alice.id ?? "",
    acct: alice.acct ?? "",
    display_name: alice.display_name ?? "",
  },
});

// A remote account's featured collection arrives with more than one entry, so
// the strip is a list rather than a single row (docs/PLAN.ja.md, Akkoma
// pitfalls).
const pinnedPosts: Status[] = [
  post("110000000000000009", "Alice's pinned post"),
  post("110000000000000008", "Alice's second pinned post"),
];

const alicePosts: Status[] = [
  post("110000000000000002", "Alice's newer post"),
  post("110000000000000001", "Alice's older post"),
];

const bodies = [...pinnedPosts, ...alicePosts].map((status) =>
  (status.content ?? "").replace(/<\/?p>/g, ""),
);

/**
 * Every status row on the plane, in document order: which post it is (each
 * fixture body is unique) and whether it carries the pinned marker. Order and
 * repetition are the assertion, so the rows are compared as one list.
 */
const rowsInOrder = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("article"), (article) => {
    const text = article.textContent ?? "";
    return {
      body: bodies.find((body) => text.includes(body)) ?? "(unknown)",
      marked: text.includes("Pinned"),
    };
  });

// MSW is the only mock seam (ADR-0009).
const server = setupServer();

/** The statuses requests the page made, pinned strip and list alike. */
let requested: URL[] = [];

/**
 * Both callers of `/statuses` behind one handler, told apart by the query the
 * strip adds. `pinned` answers the strip; everything else is the tab's list.
 */
const statuses = (pinned: () => Response) =>
  http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
    const url = new URL(request.url);
    requested.push(url);
    return url.searchParams.has("pinned")
      ? pinned()
      : HttpResponse.json(alicePosts);
  });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  requested = [];
  // The query cache lives in the router module, not in the render tree, so an
  // answer fetched by one test would serve the next one without a request.
  query.clear();
});
afterAll(() => server.close());

// Mirrors App.tsx: a layout route with the preload attached and one leaf per
// tab. The fallback text is deliberately not the page's own "Loading…" row, so
// the two are distinguishable in assertions.
const Chrome = (props: ParentProps) => (
  <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
);

const renderProfile = (path: string) => {
  const history = createMemoryHistory();
  history.set({ value: path, replace: true });
  return render(() => (
    <MemoryRouter history={history} root={Chrome}>
      <Route
        path="/accounts/:acct"
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
  ));
};

test("the Posts tab shows the statuses fetched with pinned=true above the regular list, each labeled Pinned", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    statuses(() => HttpResponse.json(pinnedPosts)),
  );
  const { findByText, container } = renderProfile(`/accounts/${ALICE_ACCT}`);

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(await findByText("Alice's pinned post")).toBeInTheDocument();

  expect(rowsInOrder(container)).toEqual([
    { body: "Alice's pinned post", marked: true },
    { body: "Alice's second pinned post", marked: true },
    { body: "Alice's newer post", marked: false },
    { body: "Alice's older post", marked: false },
  ]);

  const strip = requested.filter((url) => url.searchParams.has("pinned"));
  expect(strip).toHaveLength(1);
  expect(strip[0]?.searchParams.get("pinned")).toBe("true");
  // Akkoma ANDs the two, so the tab's filter would drop pinned replies
  // (profile-api.ts).
  expect(strip[0]?.searchParams.has("exclude_replies")).toBe(false);

  const list = requested.filter((url) => !url.searchParams.has("pinned"));
  expect(list).toHaveLength(1);
  expect(list[0]?.searchParams.get("exclude_replies")).toBe("true");
});

test("the Replies and Media tabs neither fetch nor show the pinned statuses", async () => {
  for (const tab of [postsAndReplies, media] satisfies ProfileTab[]) {
    server.use(
      http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
      statuses(() => HttpResponse.json(pinnedPosts)),
    );
    const { findByText, queryByText, unmount } = renderProfile(
      profileTabPath(ALICE_ACCT, tab),
    );

    expect(await findByText("Alice's newer post")).toBeInTheDocument();
    expect(requested.some((url) => url.searchParams.has("pinned"))).toBe(false);
    expect(queryByText("Pinned")).toBeNull();
    expect(queryByText("Alice's pinned post")).toBeNull();

    unmount();
    requested = [];
    query.clear();
  }
});

test("an account with nothing pinned gets no marker and no extra row", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    statuses(() => HttpResponse.json([])),
  );
  const { findByText, queryByText, container } = renderProfile(
    `/accounts/${ALICE_ACCT}`,
  );

  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  // The strip was asked and answered with nothing — not merely slow.
  await waitFor(() =>
    expect(
      requested.filter((url) => url.searchParams.has("pinned")),
    ).toHaveLength(1),
  );
  expect(queryByText("Pinned")).toBeNull();
  expect(rowsInOrder(container)).toEqual([
    { body: "Alice's newer post", marked: false },
    { body: "Alice's older post", marked: false },
  ]);
});

test("a pinned fetch still in flight leaves the header and the regular list on screen", async () => {
  // Held open through the assertions and released once the test ends, pass or
  // fail — after teardown, so the late answer reaches no live page or cache.
  const held = new Promise<void>((resolve) => onTestFinished(() => resolve()));
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    http.get("*/api/v1/accounts/:id/statuses", async ({ request }) => {
      const url = new URL(request.url);
      if (!url.searchParams.has("pinned")) return HttpResponse.json(alicePosts);
      await held;
      return HttpResponse.json([]);
    }),
  );
  const { findByText, findByRole, queryByText } = renderProfile(
    `/accounts/${ALICE_ACCT}`,
  );

  // The strip's own <Suspense> is what keeps its pending read from suspending
  // the route boundary, which would swap all of this for "Routing…".
  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );
  expect(queryByText("Routing…")).toBeNull();
});

test("a pinned fetch that fails shows a notice row with Retry and leaves the regular list unaffected", async () => {
  let pinnedRequests = 0;
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    statuses(() => {
      pinnedRequests += 1;
      return pinnedRequests === 1
        ? HttpResponse.json({ error: "Something went wrong" }, { status: 500 })
        : HttpResponse.json(pinnedPosts);
    }),
  );
  const { findByText, findByRole, queryByText, container } = renderProfile(
    `/accounts/${ALICE_ACCT}`,
  );

  // role="alert" so the failure is announced, not merely painted.
  expect(await findByRole("alert")).toHaveTextContent(
    /couldn't load pinned posts/i,
  );
  // Only the strip failed: the list under it is untouched, header included.
  expect(await findByText("Alice's newer post")).toBeInTheDocument();
  expect(await findByRole("heading", { level: 2 })).toHaveTextContent(
    "Alice Example",
  );
  expect(rowsInOrder(container)).toEqual([
    { body: "Alice's newer post", marked: false },
    { body: "Alice's older post", marked: false },
  ]);

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("Alice's pinned post")).toBeInTheDocument();
  expect(queryByText(/couldn't load pinned posts/i)).toBeNull();
  expect(pinnedRequests).toBe(2);
  // The list is not refetched by the strip's recovery.
  expect(
    requested.filter((url) => !url.searchParams.has("pinned")),
  ).toHaveLength(1);
});

test("a status that is both pinned and in the regular list renders twice, marked only in the strip", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () => HttpResponse.json(alice)),
    statuses(() => HttpResponse.json([alicePosts[0]])),
  );
  const { findByText, container } = renderProfile(`/accounts/${ALICE_ACCT}`);

  // Both rows carry the same body, so the marker is what says the strip
  // arrived.
  expect(await findByText("Pinned")).toBeInTheDocument();

  expect(rowsInOrder(container)).toEqual([
    { body: "Alice's newer post", marked: true },
    { body: "Alice's newer post", marked: false },
    { body: "Alice's older post", marked: false },
  ]);
});
