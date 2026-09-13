// @vitest-environment happy-dom
// Who an account follows and who follows it, as a reader walks them: the rows,
// the paging cursor, the two empty states, the failure path, and what survives
// a trip to one of the profiles the list links to. Page-level with MSW as the
// only seam (ADR-0009).
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
import { Retention } from "../../entities/retention/retention";
import { FollowList } from "./FollowList";
import { followers, following, followListPath } from "./follow-list";
import { ProfilePage, ProfilePosts } from "./ProfilePage";
import type { Account } from "./profile-api";
import { preloadProfile } from "./profile-query";
import { posts } from "./profile-tabs";

// happy-dom's IntersectionObserver constructs but never actually calls back
// (see ProfilePage.tsx's PostsSentinel) — this fake stands in for the global so
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

// The sentinel the page mounted most recently — after a return trip that is
// the resumed list's own, not the disposed one's.
const currentSentinel = (): FakeIntersectionObserver => {
  const observer = FakeIntersectionObserver.instances.at(-1);
  if (observer === undefined) throw new Error("no sentinel is mounted");
  return observer;
};

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment).
const ALICE_ACCT = "alice@fixture.example";
const ALICE_ID = "900000000000000001";

const alice: Account = {
  id: ALICE_ID,
  acct: ALICE_ACCT,
  display_name: "Alice Example",
  statuses_count: 42,
  following_count: 7,
  followers_count: 13,
};

const zoe: Account = {
  id: "900000000000000009",
  acct: "zoe",
  display_name: "Zoe :party:",
  emojis: [{ shortcode: "party", url: "https://fixture.example/party.png" }],
};

// Fixed-width ids so the descending numbering is also descending
// lexicographically, as flake ids are (docs/PLAN.ja.md, Akkoma pitfalls).
const idOf = (n: number): string =>
  `8000000000000${String(n).padStart(5, "0")}`;

const member = (n: number): Account => ({
  id: idOf(n),
  acct: `user${n}`,
  display_name: `User ${n}`,
});

// Exactly the server's clamp: a page this long cannot rule out more accounts
// below it, so it is what keeps the sentinel mounted (follow-list-api.ts).
const fullPage: Account[] = Array.from({ length: 40 }, (_, i) =>
  member(80 - i),
);
const fullPageTailId = idOf(41);
const secondPage: Account[] = [member(40), member(39)];

// Every list request, in order: whether a list was refetched is only visible
// here.
const listRequests: URL[] = [];

// Alice plus a stand-in for whichever listed account a row is followed into.
const accountHandler = http.get<{ id: string }>(
  "*/api/v1/accounts/:id",
  ({ params }) =>
    HttpResponse.json(
      params.id === ALICE_ACCT
        ? alice
        : {
            id: params.id,
            acct: params.id,
            display_name: `Profile of ${params.id}`,
          },
    ),
);

const listHandler = (kind: "following" | "followers", pages: Account[][]) =>
  http.get(`*/api/v1/accounts/:id/${kind}`, ({ request }) => {
    const url = new URL(request.url);
    listRequests.push(url);
    const maxId = url.searchParams.get("max_id");
    const page = maxId === null ? pages[0] : pages[1];
    return HttpResponse.json(page ?? []);
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
  listRequests.length = 0;
  // The query cache lives in the router module, not in the render tree, so an
  // account fetched by one test would answer the next one without a request.
  query.clear();
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

// Mirrors App.tsx: the profile is a layout route with the preload attached,
// the follow lists are two of its leaves, and retention is the pathless route
// above them. The Suspense fallback is deliberately not the page's own
// "Loading…" row, so the two are distinguishable in assertions.
const Chrome = (props: ParentProps) => (
  <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
);

const renderProfile = (path: string) => {
  const history = createMemoryHistory();
  history.set({ value: path, replace: true });
  const RetainingRoutes = (props: ParentProps) => (
    <Retention signedIn={true}>{props.children}</Retention>
  );
  return {
    history,
    ...render(() => (
      <MemoryRouter history={history} root={Chrome}>
        <Route component={RetainingRoutes}>
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
              path={following.path}
              component={() => <FollowList list={following} />}
            />
            <Route
              path={followers.path}
              component={() => <FollowList list={followers} />}
            />
          </Route>
        </Route>
      </MemoryRouter>
    )),
  };
};

test("the following list names each account, links to its profile, and asks by the account's id", async () => {
  server.use(accountHandler, listHandler("following", [[zoe]]));
  const { findByRole, findByAltText } = renderProfile(
    followListPath(ALICE_ACCT, following),
  );

  const row = await findByRole("link", { name: /Zoe/ });
  expect(row).toHaveAttribute("href", "/users/zoe");
  expect(row).toHaveTextContent("@zoe");
  // The display name's custom emoji is rendered, not left as a shortcode.
  expect(await findByAltText(":party:")).toBeInTheDocument();

  // The list endpoints take the flake id only; a nickname is a 404
  // (follow-list-api.ts).
  expect(listRequests).toHaveLength(1);
  expect(listRequests[0]?.pathname).toBe(
    `/api/v1/accounts/${ALICE_ID}/following`,
  );
  expect(listRequests[0]?.searchParams.get("limit")).toBe("40");
});

test("a full page pages on from its tail account's id and stops asking once a short page arrives", async () => {
  server.use(accountHandler, listHandler("following", [fullPage, secondPage]));
  const { findByText } = renderProfile(followListPath(ALICE_ACCT, following));

  expect(await findByText("User 41")).toBeInTheDocument();
  currentSentinel().fireVisible();

  expect(await findByText("User 39")).toBeInTheDocument();
  expect(listRequests).toHaveLength(2);
  expect(listRequests[1]?.searchParams.get("max_id")).toBe(fullPageTailId);

  // The short page settles the verdict and the sentinel goes; a stray re-fire
  // of the observer it left behind asks for nothing.
  currentSentinel().fireVisible();
  expect(listRequests).toHaveLength(2);
});

// Akkoma answers a withheld list with an empty page rather than an error
// (follow-list.ts), so the flag on the account is all that separates these two.
test("an empty list from an account that hides it reads as withheld", async () => {
  server.use(
    http.get("*/api/v1/accounts/:id", () =>
      HttpResponse.json({ ...alice, pleroma: { hide_follows: true } }),
    ),
    listHandler("following", [[]]),
  );
  const { findByText } = renderProfile(followListPath(ALICE_ACCT, following));

  expect(
    await findByText("This account doesn't show who they follow."),
  ).toBeInTheDocument();
});

test("an empty list from an account that hides nothing reads as empty", async () => {
  server.use(accountHandler, listHandler("following", [[]]));
  const { findByText } = renderProfile(followListPath(ALICE_ACCT, following));

  expect(await findByText("Not following anyone yet.")).toBeInTheDocument();
});

test("a failed first page offers Retry, and Retry fetches it again", async () => {
  let attempts = 0;
  server.use(
    accountHandler,
    http.get("*/api/v1/accounts/:id/following", ({ request }) => {
      listRequests.push(new URL(request.url));
      attempts += 1;
      return attempts === 1
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json([zoe]);
    }),
  );
  const { findByRole } = renderProfile(followListPath(ALICE_ACCT, following));

  const retry = await findByRole("button", { name: "Retry" });
  expect(await findByRole("alert")).toHaveTextContent(
    "Couldn't load who this account follows (500).",
  );

  await userEvent.click(retry);

  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();
  expect(listRequests).toHaveLength(2);
});

test("the followers list asks the followers endpoint and says so when it is empty", async () => {
  server.use(accountHandler, listHandler("followers", [[]]));
  const { findByText } = renderProfile(followListPath(ALICE_ACCT, followers));

  expect(await findByText("No followers yet.")).toBeInTheDocument();
  expect(listRequests[0]?.pathname).toBe(
    `/api/v1/accounts/${ALICE_ID}/followers`,
  );
});

test("returning from a listed account's profile shows the list again, without refetching, and it pages on", async () => {
  server.use(
    accountHandler,
    listHandler("following", [fullPage, secondPage]),
    http.get("*/api/v1/accounts/:id/statuses", () => HttpResponse.json([])),
  );
  const { history, findByText, findByRole, queryByText } = renderProfile(
    followListPath(ALICE_ACCT, following),
  );

  expect(await findByText("User 80")).toBeInTheDocument();
  expect(listRequests).toHaveLength(1);

  await userEvent.click(await findByRole("link", { name: /User 80/ }));
  expect(await findByText("Profile of user80")).toBeInTheDocument();
  expect(queryByText("User 80")).not.toBeInTheDocument();

  history.back();

  expect(await findByText("User 80")).toBeInTheDocument();
  expect(listRequests).toHaveLength(1);

  // The canary for a store retained across the page that created it: its
  // signals would come back frozen and the resumed sentinel would either stall
  // or fire without limit.
  currentSentinel().fireVisible();

  expect(await findByText("User 39")).toBeInTheDocument();
  // Anchored at the retained tail, so the resumed list paged on from where the
  // disposed one left off rather than from a rebuilt head.
  expect(listRequests[1]?.searchParams.get("max_id")).toBe(fullPageTailId);
});
