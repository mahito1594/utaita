// @vitest-environment happy-dom
// The accounts behind a post's favourite and boost counts, as a reader opens
// them: the tab bar over the three lists, the rows, the empty answer, the
// failure path, and the way back to the post. Page-level with MSW as the only
// seam (ADR-0009).
import {
  A,
  createMemoryHistory,
  MemoryRouter,
  query,
  Route,
} from "@solidjs/router";
import { cleanup, render, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { type ParentProps, Suspense } from "solid-js";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { Retention } from "../../entities/retention/retention";
import type { Status } from "../../entities/status/types";
import { statusPath } from "../../entities/status/url";
import type { Account } from "../profile/profile-api";
import { ReactionsList, WhoList, WhoListsPage } from "./WhoListsPage";
import { boosts, favourites, reactions, whoListPath } from "./who-lists";
import type { ReactionGroup } from "./who-lists-api";
import { preloadWhoLists } from "./who-lists-query";

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment).
const SUBJECT_ID = "110000000000000002";

const subject: Status = {
  id: SUBJECT_ID,
  content: "<p>The post that was opened</p>",
  created_at: "2026-08-01T12:01:00.000Z",
  in_reply_to_id: null,
  favourites_count: 2,
  reblogs_count: 1,
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
};

const zoe: Account = {
  id: "900000000000000009",
  acct: "zoe",
  display_name: "Zoe :party:",
  emojis: [{ shortcode: "party", url: "https://fixture.example/party.png" }],
};

const bob: Account = {
  id: "900000000000000008",
  acct: "bob",
  display_name: "Bob Example",
};

// A unicode reaction and a custom-emoji one: the chip draws the first as text
// and the second as its image.
const partyGroup: ReactionGroup = {
  name: "\u{1F389}",
  count: 2,
  me: false,
  url: null,
  accounts: [zoe, bob],
};

const blobcatGroup: ReactionGroup = {
  name: ":blobcat:",
  count: 1,
  me: true,
  url: "https://fixture.example/blobcat.png",
  accounts: [bob],
};

// Akkoma counts the reactions and then drops the accounts it will not show
// the reader, so `count` can run ahead of `accounts`: the count is taken
// before the filter (emoji_reaction_view.ex `show.json`, account_view.ex
// `index.json` in AkkomaGang/akkoma).
const heartGroup: ReactionGroup = {
  name: "\u2764\uFE0F",
  count: 3,
  me: false,
  url: null,
  accounts: [zoe, bob],
};

// Every list request, in order: whether a list was refetched is only visible
// here.
const listRequests: URL[] = [];

// MSW is the only mock seam (ADR-0009): tests exercise the real client,
// toResult, query and page rendering; only HTTP is simulated.
const server = setupServer();

// The heading and the tab counts come from the conversation's own cache entry
// (thread-query.ts), so the page asks for the subject and its context.
const subjectHandlers = [
  http.get("*/api/v1/statuses/:id/context", () =>
    HttpResponse.json({ ancestors: [], descendants: [] }),
  ),
  http.get("*/api/v1/statuses/:id", () => HttpResponse.json(subject)),
];

const listHandler = (segment: string, accounts: Account[]) =>
  http.get(`*/api/v1/statuses/:id/${segment}`, ({ request }) => {
    listRequests.push(new URL(request.url));
    return HttpResponse.json(accounts);
  });

// Takes partial groups too: every field is optional in the spec, so the tab has
// to survive what the parser is given (who-lists-api.ts).
const reactionsHandler = (groups: Partial<ReactionGroup>[]) =>
  http.get("*/api/v1/pleroma/statuses/:id/reactions", ({ request }) => {
    listRequests.push(new URL(request.url));
    return HttpResponse.json(groups);
  });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  listRequests.length = 0;
  // The query cache lives in the router module, not in the render tree, so a
  // list fetched by one test would answer the next one without a request.
  query.clear();
});
afterAll(() => {
  server.close();
});

// Mirrors App.tsx: the lists are leaves of a layout route sharing the thread's
// path, retention is the pathless route above, and the Suspense boundary the
// page's loading falls into belongs to the layout. The fallback is
// deliberately not the page's own "Loading…" row, so the two are
// distinguishable in assertions.
const Chrome = (props: ParentProps) => (
  <>
    <A href={whoListPath(SUBJECT_ID, favourites)}>Open favourites</A>
    <Suspense fallback={<p>Routing…</p>}>{props.children}</Suspense>
  </>
);

const RetainingRoutes = (props: ParentProps) => (
  <Retention signedIn={true}>{props.children}</Retention>
);

const renderApp = (history = createMemoryHistory()) =>
  render(() => (
    <MemoryRouter history={history} root={Chrome}>
      <Route path="/" component={() => <p>Home timeline</p>} />
      <Route path="/accounts/:acct" component={() => <p>A profile</p>} />
      <Route component={RetainingRoutes}>
        <Route path="/statuses/:id" component={() => <p>The conversation</p>} />
        <Route
          path="/statuses/:id"
          component={WhoListsPage}
          preload={preloadWhoLists}
        >
          <Route
            path={favourites.path}
            component={() => <WhoList list={favourites} />}
          />
          <Route
            path={boosts.path}
            component={() => <WhoList list={boosts} />}
          />
          <Route path={reactions.path} component={ReactionsList} />
        </Route>
      </Route>
    </MemoryRouter>
  ));

/** Renders straight at a list URL, the way a shared link opens it. */
const renderListDirectly = (path: string) => {
  const history = createMemoryHistory();
  history.set({ value: path, replace: true });
  return renderApp(history);
};

test("the favourites tab names the post, marks its own tab current, and lists each account as a link to its profile", async () => {
  server.use(...subjectHandlers, listHandler("favourited_by", [zoe, bob]));
  const { findByRole, findAllByRole, findByAltText, getByRole } =
    renderListDirectly(whoListPath(SUBJECT_ID, favourites));

  expect(
    await findByRole("heading", { name: "Post by Alice Example" }),
  ).toBeInTheDocument();

  expect(
    getByRole("navigation", { name: "Post sections" }),
  ).toBeInTheDocument();

  // Three tabs, and `aria-current="page"` — what an `<A>` puts on an exact
  // path match — is the only marker of which one is open.
  const tabs = await findAllByRole("link", {
    name: /^(Favourites|Boosts|Reactions)/,
  });
  expect(tabs).toHaveLength(3);
  expect(tabs[0]).toHaveAttribute("href", whoListPath(SUBJECT_ID, favourites));
  expect(tabs[0]).toHaveAttribute("aria-current", "page");
  expect(tabs[1]).toHaveAttribute("href", whoListPath(SUBJECT_ID, boosts));
  expect(tabs[1]).not.toHaveAttribute("aria-current");
  expect(tabs[2]).toHaveAttribute("href", whoListPath(SUBJECT_ID, reactions));
  expect(tabs[2]).not.toHaveAttribute("aria-current");

  const row = await findByRole("link", { name: /Zoe/ });
  expect(row).toHaveAttribute("href", "/accounts/zoe");
  // The display name's custom emoji is rendered, not left as a shortcode.
  expect(await findByAltText(":party:")).toBeInTheDocument();
  expect(await findByRole("link", { name: /Bob Example/ })).toHaveAttribute(
    "href",
    "/accounts/bob",
  );

  expect(listRequests).toHaveLength(1);
  expect(listRequests[0]?.pathname).toBe(
    `/api/v1/statuses/${SUBJECT_ID}/favourited_by`,
  );
});

test("the boosts tab asks the reblogged_by endpoint and lists who boosted the post", async () => {
  server.use(...subjectHandlers, listHandler("reblogged_by", [bob]));
  const { findByRole, findAllByRole } = renderListDirectly(
    whoListPath(SUBJECT_ID, boosts),
  );

  expect(await findByRole("link", { name: /Bob Example/ })).toHaveAttribute(
    "href",
    "/accounts/bob",
  );
  const tabs = await findAllByRole("link", {
    name: /^(Favourites|Boosts|Reactions)/,
  });
  expect(tabs[1]).toHaveAttribute("aria-current", "page");
  expect(listRequests[0]?.pathname).toBe(
    `/api/v1/statuses/${SUBJECT_ID}/reblogged_by`,
  );
});

test("an empty answer shows the tab's empty copy", async () => {
  server.use(...subjectHandlers, listHandler("favourited_by", []));
  const { findByText } = renderListDirectly(
    whoListPath(SUBJECT_ID, favourites),
  );

  expect(await findByText(favourites.empty)).toBeInTheDocument();
});

test("a 404 shows an error row, and its Retry fetches the list again", async () => {
  let attempts = 0;
  server.use(
    ...subjectHandlers,
    http.get("*/api/v1/statuses/:id/favourited_by", ({ request }) => {
      listRequests.push(new URL(request.url));
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ error: "Record not found" }, { status: 404 })
        : HttpResponse.json([zoe]);
    }),
  );
  const { findByRole } = renderListDirectly(
    whoListPath(SUBJECT_ID, favourites),
  );

  const retry = await findByRole("button", { name: "Retry" });
  expect(await findByRole("alert")).toHaveTextContent(
    "Couldn't load who favourited this post (404).",
  );

  await userEvent.click(retry);

  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();
  expect(listRequests).toHaveLength(2);
});

test("Back is a button when the list was opened from inside the app", async () => {
  server.use(...subjectHandlers, listHandler("favourited_by", [zoe]));
  const { findByRole, findByText } = renderApp();

  await userEvent.click(await findByRole("link", { name: "Open favourites" }));
  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Back" }));

  expect(await findByText("Home timeline")).toBeInTheDocument();
});

test("Back is a link to the post when the list was opened directly", async () => {
  // Nothing of this app is behind the first entry, so a history back would
  // leave it; the conversation the list belongs to is where the reader goes.
  server.use(...subjectHandlers, listHandler("favourited_by", [zoe]));
  const { findByRole, findByText, queryByRole } = renderListDirectly(
    whoListPath(SUBJECT_ID, favourites),
  );

  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();
  expect(queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

  const back = await findByRole("link", { name: "Back" });
  expect(back).toHaveAttribute("href", statusPath(SUBJECT_ID));

  await userEvent.click(back);
  expect(await findByText("The conversation")).toBeInTheDocument();
});

test("the reactions tab shows one group per reaction with an account row under each", async () => {
  server.use(...subjectHandlers, reactionsHandler([partyGroup, blobcatGroup]));
  const { findAllByRole, findByRole, findByAltText } = renderListDirectly(
    whoListPath(SUBJECT_ID, reactions),
  );

  const groups = await findAllByRole("region");
  expect(groups).toHaveLength(2);

  // The unicode chip draws the emoji as text, beside the number of reactions.
  const party = await findByRole("region", { name: partyGroup.name });
  expect(party).toHaveTextContent(partyGroup.name);
  expect(party).toHaveTextContent("2");
  expect(within(party).getByRole("link", { name: /Zoe/ })).toHaveAttribute(
    "href",
    "/accounts/zoe",
  );
  expect(
    within(party).getByRole("link", { name: /Bob Example/ }),
  ).toHaveAttribute("href", "/accounts/bob");
  expect(within(party).getAllByRole("listitem")).toHaveLength(2);

  // The custom chip draws the emoji's image, named by its shortcode.
  const blobcat = await findByRole("region", { name: ":blobcat:" });
  expect(within(blobcat).getAllByRole("listitem")).toHaveLength(1);
  expect(await findByAltText(":blobcat:")).toHaveAttribute(
    "src",
    blobcatGroup.url,
  );

  // The generated type demands an `emoji` path param this route has no slot
  // for; the URL asked for must stay the bare one (who-lists-api.ts).
  expect(listRequests).toHaveLength(1);
  expect(listRequests[0]?.pathname).toBe(
    `/api/v1/pleroma/statuses/${SUBJECT_ID}/reactions`,
  );
});

test("each reaction group's band is a level 3 heading saying how many people reacted, in the singular for one", async () => {
  server.use(
    ...subjectHandlers,
    reactionsHandler([partyGroup, blobcatGroup, heartGroup]),
  );
  const { findByRole } = renderListDirectly(whoListPath(SUBJECT_ID, reactions));

  // Beside the chip, whose own number is bare: the band is the only place
  // that says what the number counts.
  const party = await findByRole("region", { name: partyGroup.name });
  expect(
    within(party).getByRole("heading", { level: 3, name: /2 people/ }),
  ).toBeInTheDocument();

  const blobcat = await findByRole("region", { name: blobcatGroup.name });
  expect(
    within(blobcat).getByRole("heading", { level: 3, name: /1 person/ }),
  ).toBeInTheDocument();

  // The reaction count, not the number of rows: they part company whenever
  // the instance withholds an account it counted.
  const heart = await findByRole("region", { name: heartGroup.name });
  expect(
    within(heart).getByRole("heading", { level: 3, name: /3 people/ }),
  ).toBeInTheDocument();
  expect(within(heart).getAllByRole("listitem")).toHaveLength(2);
});

test("an empty reactions answer shows the reactions tab's empty copy", async () => {
  server.use(...subjectHandlers, reactionsHandler([]));
  const { findByText } = renderListDirectly(whoListPath(SUBJECT_ID, reactions));

  expect(await findByText(reactions.empty)).toBeInTheDocument();
});

test("on the reactions tab a group without a name draws no section, and one without a url draws its name as text", async () => {
  server.use(
    ...subjectHandlers,
    reactionsHandler([
      partyGroup,
      blobcatGroup,
      { count: 1, accounts: [zoe] },
      { name: "\u{1F44D}", count: 2, accounts: [bob] },
    ]),
  );
  const { findAllByRole, findByRole, getAllByRole, queryByAltText } =
    renderListDirectly(whoListPath(SUBJECT_ID, reactions));

  // Three sections for the three named groups: a group the parser cannot name
  // is dropped whole (who-lists-api.ts), so Zoe keeps the single row she has
  // under the first emoji.
  const groups = await findAllByRole("region");
  expect(groups).toHaveLength(3);
  expect(getAllByRole("link", { name: /Zoe/ })).toHaveLength(1);

  // A group without a `url` is a unicode emoji: its chip is the glyph as text,
  // where a custom emoji would be an image named by its shortcode.
  const thumbsUp = await findByRole("region", { name: "\u{1F44D}" });
  expect(thumbsUp).toHaveTextContent("\u{1F44D}");
  expect(queryByAltText("\u{1F44D}")).not.toBeInTheDocument();
  expect(
    within(thumbsUp).getByRole("link", { name: /Bob Example/ }),
  ).toBeInTheDocument();
});

test("a 403 on the reactions tab shows an error row, and its Retry fetches the groups again", async () => {
  let attempts = 0;
  server.use(
    ...subjectHandlers,
    http.get("*/api/v1/pleroma/statuses/:id/reactions", ({ request }) => {
      listRequests.push(new URL(request.url));
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ error: "Access denied" }, { status: 403 })
        : HttpResponse.json([partyGroup]);
    }),
  );
  const { findByRole } = renderListDirectly(whoListPath(SUBJECT_ID, reactions));

  const retry = await findByRole("button", { name: "Retry" });
  expect(await findByRole("alert")).toHaveTextContent(
    "Couldn't load who reacted to this post (403).",
  );

  await userEvent.click(retry);

  expect(
    await findByRole("region", { name: partyGroup.name }),
  ).toBeInTheDocument();
  expect(listRequests).toHaveLength(2);
});

test("Back returns to the conversation after a tab switch, when the list was opened from inside the app", async () => {
  server.use(
    ...subjectHandlers,
    listHandler("favourited_by", [zoe]),
    listHandler("reblogged_by", [bob]),
  );
  const history = createMemoryHistory();
  history.set({ value: statusPath(SUBJECT_ID), replace: true });
  const { findByRole, findByText } = renderApp(history);

  await userEvent.click(await findByRole("link", { name: "Open favourites" }));
  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: /^Boosts/ }));
  expect(await findByRole("link", { name: /Bob Example/ })).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Back" }));

  expect(await findByText("The conversation")).toBeInTheDocument();
});

test("Back stays a link to the post after a tab switch, when the list was opened directly", async () => {
  server.use(
    ...subjectHandlers,
    listHandler("favourited_by", [zoe]),
    listHandler("reblogged_by", [bob]),
  );
  const { findByRole, queryByRole } = renderListDirectly(
    whoListPath(SUBJECT_ID, favourites),
  );

  await userEvent.click(await findByRole("link", { name: /^Boosts/ }));
  expect(await findByRole("link", { name: /Bob Example/ })).toBeInTheDocument();

  expect(queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  expect(await findByRole("link", { name: "Back" })).toHaveAttribute(
    "href",
    statusPath(SUBJECT_ID),
  );
});

test("a direct arrival draws the heading, the tabs and a Loading row while the list is still out", async () => {
  // Held answers, so the page can be read in the state a direct arrival puts
  // it in: nothing fetched yet, everything the page owns already drawn.
  let answerThread!: () => void;
  const threadHeld = new Promise<void>((resolve) => {
    answerThread = resolve;
  });
  let answerList!: () => void;
  const listHeld = new Promise<void>((resolve) => {
    answerList = resolve;
  });
  server.use(
    // Ahead of `subjectHandlers`, whose `/context` answer is still wanted:
    // MSW takes the first handler that matches.
    http.get("*/api/v1/statuses/:id", async () => {
      await threadHeld;
      return HttpResponse.json(subject);
    }),
    ...subjectHandlers,
    http.get("*/api/v1/statuses/:id/favourited_by", async ({ request }) => {
      listRequests.push(new URL(request.url));
      await listHeld;
      return HttpResponse.json([zoe]);
    }),
  );
  const { findByRole, getByRole, getAllByRole, queryByText } =
    renderListDirectly(whoListPath(SUBJECT_ID, favourites));

  expect(await findByRole("heading", { name: "Post" })).toBeInTheDocument();
  expect(
    getAllByRole("link", { name: /^(Favourites|Boosts|Reactions)/ }),
  ).toHaveLength(3);

  // Under the tab bar, inside the page — not the layout's fallback, which
  // would have hidden the heading and the tabs with it.
  const loading = getByRole("status");
  expect(loading).toHaveTextContent("Loading…");
  expect(loading.previousElementSibling).toBe(
    getByRole("navigation", { name: "Post sections" }),
  );
  expect(queryByText("Routing…")).not.toBeInTheDocument();

  answerThread();
  expect(
    await findByRole("heading", { name: "Post by Alice Example" }),
  ).toBeInTheDocument();
  expect(getByRole("status")).toHaveTextContent("Loading…");

  answerList();
  expect(await findByRole("link", { name: /Zoe/ })).toBeInTheDocument();
});
