// @vitest-environment happy-dom
// Pulling a reply's missing parent onto the instance. The operation is a
// remote round trip and a write to the instance's database, so what these
// tests are about is as much when it does *not* happen as when it does.
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
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Status } from "../../entities/status/types";
import { statusPath } from "../../entities/status/url";
import { ThreadPage } from "./ThreadPage";
import type { ThreadContext } from "./thread-api";
import { preloadThread } from "./thread-query";

// Hand-written, anonymized fixtures typed against the generated schema
// (ADR-0002 amendment); ids are 18 characters like real flake ids.
const SUBJECT_ID = "110000000000000002";
const PARENT_ID = "110000000000000009";
const PARENT_APID = "https://remote.example/objects/abc";

const account = {
  id: "900000000000000001",
  acct: "alice@fixture.example",
  display_name: "Alice Example",
};

// Akkoma's sentinel for a parent this instance does not hold, with the real
// parent's AP id in the Akkoma extension (docs/PLAN.ja.md, pitfalls).
const orphanSubject: Status = {
  id: SUBJECT_ID,
  content: "<p>The post that was opened</p>",
  created_at: "2026-08-01T12:01:00.000Z",
  in_reply_to_id: "_",
  akkoma: { in_reply_to_apid: PARENT_APID },
  account,
};

// The same reply once the instance holds its parent: the sentinel is gone and
// the id is real, which is why the whole conversation has to be refetched
// rather than just the context.
const linkedSubject: Status = {
  ...orphanSubject,
  in_reply_to_id: PARENT_ID,
};

const parent: Status = {
  id: PARENT_ID,
  uri: PARENT_APID,
  content: "<p>The post from the other instance</p>",
  created_at: "2026-08-01T12:00:00.000Z",
  in_reply_to_id: null,
  account,
};

const server = setupServer();

/** Whether the instance has been made to hold the parent yet. */
let ingested = false;

const contextRequests: URL[] = [];
const searchQueries: URLSearchParams[] = [];

const threadHandlers = [
  http.get("*/api/v1/statuses/:id/context", ({ request }) => {
    contextRequests.push(new URL(request.url));
    const context: ThreadContext = ingested
      ? { ancestors: [parent], descendants: [] }
      : { ancestors: [], descendants: [] };
    return HttpResponse.json(context);
  }),
  http.get("*/api/v1/statuses/:id", () =>
    HttpResponse.json(ingested ? linkedSubject : orphanSubject),
  ),
];

/** Records the search and reports the outcome the test is about. */
const searchHandler = (
  respond: () => Promise<Response> | Response,
  onSearch?: () => void,
) =>
  http.get("*/api/v2/search", ({ request }) => {
    searchQueries.push(new URL(request.url).searchParams);
    onSearch?.();
    return respond();
  });

// A fresh response per call: a Response body can only be read once.
const resolved = () =>
  HttpResponse.json({ accounts: [], hashtags: [], statuses: [parent] });

// Every element reports the same offset, which is enough: the subject row is
// the only one the page measures. happy-dom has no layout of its own, so this
// stands in for the ancestor arriving above the subject and pushing it down.
let viewportTop = 0;

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(0, viewportTop, 0, 0),
  );
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The query cache lives in the router module, not in the render tree.
  query.clear();
  vi.clearAllMocks();
  ingested = false;
  viewportTop = 0;
  contextRequests.length = 0;
  searchQueries.length = 0;
});
afterAll(() => {
  server.close();
  vi.restoreAllMocks();
});

const Chrome = (props: ParentProps) => (
  <Suspense fallback={<p>Loading…</p>}>{props.children}</Suspense>
);

/** Renders straight at the thread URL, the way a shared link opens it. */
const renderThread = (history = createMemoryHistory()) => {
  history.set({ value: statusPath(SUBJECT_ID), replace: true });
  return render(() => (
    <MemoryRouter history={history} root={Chrome}>
      <Route path="/" component={() => <p>Home timeline</p>} />
      <Route
        path="/statuses/:id"
        component={ThreadPage}
        preload={preloadThread}
      />
    </MemoryRouter>
  ));
};

/** Lets the router's transition and the effects behind it run to completion. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

test("leaves the missing parent alone until the reader asks for it", async () => {
  // The whole point of the affordance: rendering a conversation must never
  // commit the instance to fetching from a stranger.
  server.use(...threadHandlers, searchHandler(resolved));
  const { findByText, findByRole } = renderThread();

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(
    await findByRole("button", { name: "Fetch new remote resource" }),
  ).toBeInTheDocument();
  await settle();

  expect(searchQueries).toHaveLength(0);
});

test("fetches the missing parent when asked and reads it in the conversation", async () => {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  server.use(
    ...threadHandlers,
    searchHandler(
      async () => {
        await held;
        return resolved();
      },
      () => {
        ingested = true;
      },
    ),
  );
  const { findByText, findByRole, queryByText } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );

  // The round trip takes seconds against a real instance, so the wait has to
  // be visible while it happens.
  const button = await findByRole("button", { name: "Fetching…" });
  expect(button).toHaveAttribute("aria-disabled", "true");
  expect(
    queryByText("The post from the other instance"),
  ).not.toBeInTheDocument();

  release();

  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();
  expect(searchQueries[0]?.get("q")).toBe(PARENT_APID);
  expect(searchQueries[0]?.get("resolve")).toBe("true");
  // The conversation is refetched, not patched: the reply's own link to its
  // parent only exists in a fresh copy.
  expect(contextRequests).toHaveLength(2);
});

test("holds the opened post where the reader left it when an ancestor lands above it", async () => {
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  viewportTop = 100;
  server.use(
    // The reload that brings the ancestor in is also what pushes the subject
    // down, so the offset only changes from this point on — which is what
    // makes the assertion below tell a held position apart from no correction
    // at all.
    http.get("*/api/v1/statuses/:id/context", () => {
      if (ingested) viewportTop = 260;
      return HttpResponse.json(
        ingested
          ? { ancestors: [parent], descendants: [] }
          : { ancestors: [], descendants: [] },
      );
    }),
    ...threadHandlers,
    searchHandler(resolved, () => {
      ingested = true;
    }),
  );
  const { findByText, findByRole } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );
  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();

  await waitFor(() => expect(scrollBy).toHaveBeenCalledWith(0, 160));
});

test("keeps the conversation on screen when the reload after an ingest fails", async () => {
  // The parent arrived, then the refetch died: the reader must not lose the
  // rows they were reading as the consequence of a successful action.
  let failReload = false;
  server.use(
    http.get("*/api/v1/statuses/:id/context", ({ request }) => {
      contextRequests.push(new URL(request.url));
      if (failReload) return HttpResponse.error();
      const context: ThreadContext = ingested
        ? { ancestors: [parent], descendants: [] }
        : { ancestors: [], descendants: [] };
      return HttpResponse.json(context);
    }),
    http.get("*/api/v1/statuses/:id", () => {
      if (failReload) return HttpResponse.error();
      return HttpResponse.json(ingested ? linkedSubject : orphanSubject);
    }),
    searchHandler(resolved, () => {
      ingested = true;
      failReload = true;
    }),
  );
  const { findByRole, findByText } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );

  expect(await findByRole("alert")).toHaveTextContent(/refresh failed/i);
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  failReload = false;
  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();
});

test("does not hold the reader to where they were before a failed reload", async () => {
  // The offset is measured for the rebuild the ingest was about; a reload that
  // failed brings none, and the reader keeps scrolling while the failure sits.
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  let failReload = false;
  server.use(
    http.get("*/api/v1/statuses/:id/context", () => {
      if (failReload) return HttpResponse.error();
      return HttpResponse.json(
        ingested
          ? { ancestors: [parent], descendants: [] }
          : { ancestors: [], descendants: [] },
      );
    }),
    http.get("*/api/v1/statuses/:id", () => {
      if (failReload) return HttpResponse.error();
      return HttpResponse.json(ingested ? linkedSubject : orphanSubject);
    }),
    searchHandler(resolved, () => {
      ingested = true;
      failReload = true;
    }),
  );
  const { findByRole, findByText } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );
  expect(await findByRole("alert")).toHaveTextContent(/refresh failed/i);

  // The reader goes on reading while the failure sits there.
  viewportTop = 400;
  failReload = false;
  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();
  await settle();
  expect(scrollBy).not.toHaveBeenCalled();
});

test("revalidates the thread the fetch started in, not the one the reader moved to", async () => {
  // The resolve takes seconds, and `:id` can move while it runs — the reload
  // it triggers belongs to the thread the button was pressed in.
  const replyPost: Status = {
    id: "110000000000000003",
    content: "<p>A reply to the opened post</p>",
    created_at: "2026-08-01T12:02:00.000Z",
    in_reply_to_id: SUBJECT_ID,
    account,
  };
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  server.use(
    http.get<{ id: string }>(
      "*/api/v1/statuses/:id/context",
      ({ params, request }) => {
        contextRequests.push(new URL(request.url));
        if (params.id === SUBJECT_ID) {
          return HttpResponse.json({
            ancestors: ingested ? [parent] : [],
            descendants: [replyPost],
          });
        }
        return HttpResponse.json({
          ancestors: [ingested ? linkedSubject : orphanSubject],
          descendants: [],
        });
      },
    ),
    http.get<{ id: string }>("*/api/v1/statuses/:id", ({ params }) =>
      HttpResponse.json(
        params.id === SUBJECT_ID
          ? ingested
            ? linkedSubject
            : orphanSubject
          : replyPost,
      ),
    ),
    searchHandler(
      async () => {
        await held;
        return resolved();
      },
      () => {
        ingested = true;
      },
    ),
  );
  const history = createMemoryHistory();
  const { findByRole, findByText } = renderThread(history);

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );
  expect(await findByRole("button", { name: "Fetching…" })).toBeInTheDocument();

  // The reader moves on to the reply's own thread while the resolve runs.
  await userEvent.click(await findByText("A reply to the opened post"));
  await settle();
  const before = contextRequests.length;

  release();
  await settle();

  // Whatever the resolve reloads, it is never the thread now on screen.
  const extra = contextRequests.slice(before);
  expect(extra.every((url) => url.pathname.includes(SUBJECT_ID))).toBe(true);

  // Stepping back finds the original thread rebuilt around its new parent.
  history.back();
  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();
});

test("says so when the instance answers but does not have the post", async () => {
  server.use(
    ...threadHandlers,
    searchHandler(() =>
      HttpResponse.json({ accounts: [], hashtags: [], statuses: [] }),
    ),
  );
  const { findByRole, findByText } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );

  expect(await findByRole("alert")).toHaveTextContent(/couldn't fetch/i);
  // Nothing arrived, so nothing is refetched — the first load is the only one.
  await settle();
  expect(contextRequests).toHaveLength(1);
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  // The way out of the app stays a marked, secondary affordance (ADR-0011).
  const external = await findByRole("link", { name: "External source" });
  expect(external).toHaveAttribute("href", PARENT_APID);
  expect(external).toHaveAttribute("target", "_blank");
});

test("reports a failed request on the row and fetches again on retry", async () => {
  let attempts = 0;
  server.use(
    ...threadHandlers,
    searchHandler(
      () => (attempts === 1 ? HttpResponse.error() : resolved()),
      () => {
        attempts += 1;
        if (attempts > 1) ingested = true;
      },
    ),
  );
  const { findByRole, findByText } = renderThread();

  await userEvent.click(
    await findByRole("button", { name: "Fetch new remote resource" }),
  );

  expect(await findByRole("alert")).toHaveTextContent(/connection failed/i);

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(
    await findByText("The post from the other instance"),
  ).toBeInTheDocument();
  expect(searchQueries).toHaveLength(2);
});

test("offers no fetch when the reply carries no AP id to fetch", async () => {
  // Without `in_reply_to_apid` there is nothing to ask the instance for; a
  // button here would be the dead link akkoma-fe shows.
  const { akkoma: _akkoma, ...withoutApId } = orphanSubject;
  server.use(
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json({ ancestors: [], descendants: [] }),
    ),
    http.get("*/api/v1/statuses/:id", () => HttpResponse.json(withoutApId)),
  );
  const { findByText, queryByRole } = renderThread();

  expect(
    await findByText("This instance has not fetched the post this replies to."),
  ).toBeInTheDocument();
  expect(
    queryByRole("button", { name: "Fetch new remote resource" }),
  ).not.toBeInTheDocument();
  expect(
    queryByRole("link", { name: "External source" }),
  ).not.toBeInTheDocument();
});
