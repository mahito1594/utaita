// @vitest-environment happy-dom
import {
  A,
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

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment). Ids are 18 characters like real flake ids but
// deliberately not in time order, because inside a thread the two orders come
// apart (docs/PLAN.ja.md, Akkoma pitfalls).
const status = (fields: {
  id: string;
  body: string;
  createdAt: string;
  inReplyToId?: string;
}): Status => ({
  id: fields.id,
  content: `<p>${fields.body}</p>`,
  created_at: fields.createdAt,
  in_reply_to_id: fields.inReplyToId ?? null,
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

const SUBJECT_ID = "110000000000000002";

const root = status({
  id: "110000000000000001",
  body: "The opening post",
  createdAt: "2026-08-01T12:00:00.000Z",
});
const subject = status({
  id: SUBJECT_ID,
  body: "The post that was opened",
  createdAt: "2026-08-01T12:01:00.000Z",
  inReplyToId: root.id ?? "",
});
const reply = status({
  id: "110000000000000003",
  body: "A reply to the opened post",
  createdAt: "2026-08-01T12:02:00.000Z",
  inReplyToId: SUBJECT_ID,
});
const replyToReply = status({
  id: "110000000000000004",
  body: "A reply to the reply",
  createdAt: "2026-08-01T12:03:00.000Z",
  inReplyToId: reply.id ?? "",
});
const laterReply = status({
  id: "110000000000000005",
  body: "A later reply to the opened post",
  createdAt: "2026-08-01T12:04:00.000Z",
  inReplyToId: SUBJECT_ID,
});

const wholeThread: ThreadContext = {
  ancestors: [root],
  descendants: [reply, replyToReply, laterReply],
};

// MSW is the only mock seam (ADR-0009): the real client, toResult, query and
// tree building all run; only HTTP is simulated.
const server = setupServer();

const threadHandlers = (subjectStatus: Status, context: ThreadContext) => [
  http.get("*/api/v1/statuses/:id/context", () => HttpResponse.json(context)),
  http.get("*/api/v1/statuses/:id", () => HttpResponse.json(subjectStatus)),
];

// happy-dom implements scrollIntoView as a no-op, so the element the page asks
// to bring into view is the only trace the landing leaves.
const broughtIntoView: Element[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
    this: Element,
  ) {
    broughtIntoView.push(this);
  });
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // The query cache lives in the router module, not in the render tree, so a
  // thread fetched by one test would answer the next one without a request.
  query.clear();
  broughtIntoView.length = 0;
});
afterAll(() => {
  server.close();
  vi.restoreAllMocks();
});

// Mirrors App.tsx: the thread is a sibling of the timeline routes, and the
// Suspense boundary the page's loading state falls into belongs to the layout
// above it, not to the page.
const Chrome = (props: ParentProps) => (
  <>
    <A href={statusPath(SUBJECT_ID)}>Open thread</A>
    <A href="/users/alice">Open profile</A>
    <Suspense fallback={<p>Loading…</p>}>{props.children}</Suspense>
  </>
);

const renderApp = (history = createMemoryHistory()) =>
  render(() => (
    <MemoryRouter history={history} root={Chrome}>
      <Route path="/" component={() => <p>Home timeline</p>} />
      <Route path="/users/:acct" component={() => <p>A profile</p>} />
      <Route
        path="/statuses/:id"
        component={ThreadPage}
        preload={preloadThread}
      />
    </MemoryRouter>
  ));

/** Lets the router's transition and the effects behind it run to completion. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

/** Renders straight at the thread URL, the way a shared link opens it. */
const renderThreadDirectly = () => {
  const history = createMemoryHistory();
  history.set({ value: statusPath(SUBJECT_ID), replace: true });
  return renderApp(history);
};

test("renders the conversation in reading order around the opened post", async () => {
  server.use(...threadHandlers(subject, wholeThread));
  const { findByText, container } = renderThreadDirectly();

  expect(await findByText("The post that was opened")).toBeInTheDocument();

  // Ancestors first, then the subject, then its replies depth-first: the reply
  // to a reply follows its own parent rather than waiting for the next sibling.
  const text = container.textContent ?? "";
  expect(text.indexOf("The opening post")).toBeGreaterThanOrEqual(0);
  expect(text.indexOf("A later reply to the opened post")).toBeGreaterThan(0);
  expect(text.indexOf("The opening post")).toBeLessThan(
    text.indexOf("The post that was opened"),
  );
  expect(text.indexOf("The post that was opened")).toBeLessThan(
    text.indexOf("A reply to the opened post"),
  );
  expect(text.indexOf("A reply to the opened post")).toBeLessThan(
    text.indexOf("A reply to the reply"),
  );
  expect(text.indexOf("A reply to the reply")).toBeLessThan(
    text.indexOf("A later reply to the opened post"),
  );
});

test("marks the opened post so it is not just a card among cards", async () => {
  server.use(...threadHandlers(subject, wholeThread));
  const { findByText, container } = renderThreadDirectly();

  expect(await findByText("The post that was opened")).toBeInTheDocument();

  // `aria-current="page"` is what an <A> puts on the active link; the opened
  // post is the current item of a set, which is the bare `true`.
  const marked = container.querySelectorAll('[aria-current="true"]');
  expect(marked).toHaveLength(1);
  expect(marked[0]).toHaveTextContent("The post that was opened");
});

test("says so when the post a reply answers has never been fetched", async () => {
  // Akkoma's sentinel for a parent this instance does not hold; the card's own
  // "replying to" line cannot tell that story (docs/PLAN.ja.md, pitfalls).
  const orphan = status({
    id: SUBJECT_ID,
    body: "A reply to something remote",
    createdAt: "2026-08-01T12:00:00.000Z",
    inReplyToId: "_",
  });
  server.use(...threadHandlers(orphan, { ancestors: [], descendants: [] }));
  const { findByText } = renderThreadDirectly();

  expect(
    await findByText("This instance has not fetched the post this replies to."),
  ).toBeInTheDocument();
});

test("keeps posts it could not connect to the opened one, under their own heading", async () => {
  const stranger = status({
    id: "110000000000000009",
    body: "A reply whose parent never arrived",
    createdAt: "2026-08-01T12:05:00.000Z",
    inReplyToId: "119999999999999999",
  });
  server.use(
    ...threadHandlers(subject, {
      ancestors: [root],
      descendants: [reply, stranger],
    }),
  );
  const { findByText, findByRole } = renderThreadDirectly();

  expect(
    await findByRole("heading", { name: "Not connected to this post" }),
  ).toBeInTheDocument();
  expect(
    await findByText("A reply whose parent never arrived"),
  ).toBeInTheDocument();
});

test("brings the opened post into view when the thread is entered by a link", async () => {
  server.use(...threadHandlers(subject, wholeThread));
  const { findByText, findByRole } = renderApp();

  expect(await findByText("Home timeline")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Open thread" }));
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  await waitFor(() => expect(broughtIntoView).toHaveLength(1));
  expect(broughtIntoView[0]).toHaveTextContent("The post that was opened");
  expect(broughtIntoView[0]).toHaveAttribute("aria-current", "true");
});

test("leaves the offset alone when the thread is re-entered by going back", async () => {
  // Scroll restoration runs on traversals only, and abandons a restore as soon
  // as a scroll it did not make arrives — so landing on the subject here would
  // throw away the position the reader left the thread at.
  server.use(...threadHandlers(subject, wholeThread));
  const history = createMemoryHistory();
  const { findByText, findByRole } = renderApp(history);

  await userEvent.click(await findByRole("link", { name: "Open thread" }));
  expect(await findByText("The post that was opened")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Open profile" }));
  expect(await findByText("A profile")).toBeInTheDocument();
  broughtIntoView.length = 0;

  history.back();

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  // A negative assertion needs the window the landing would have used: the
  // effect runs once routing settles, which is a task after the route renders.
  await settle();
  expect(broughtIntoView).toHaveLength(0);
});

test("goes back through history from a thread opened in-app", async () => {
  server.use(...threadHandlers(subject, wholeThread));
  const { findByText, findByRole } = renderApp();

  await userEvent.click(await findByRole("link", { name: "Open thread" }));
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Back" }));

  expect(await findByText("Home timeline")).toBeInTheDocument();
});

test("offers a way home instead when the thread was opened directly", async () => {
  // Nothing of this app is behind the first entry, so a back would leave it.
  server.use(...threadHandlers(subject, wholeThread));
  const { findByText, findByRole, queryByRole } = renderThreadDirectly();

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Home" }));

  expect(await findByText("Home timeline")).toBeInTheDocument();
});

test("renders the failure when the post is not on this instance", async () => {
  server.use(
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json({ ancestors: [], descendants: [] }),
    ),
    http.get("*/api/v1/statuses/:id", () =>
      HttpResponse.json({ error: "Record not found" }, { status: 404 }),
    ),
  );
  const { findByRole } = renderThreadDirectly();

  expect(await findByRole("alert")).toHaveTextContent(/not on this instance/i);
});

test("retries a thread that failed to load", async () => {
  let attempts = 0;
  server.use(
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json(wholeThread),
    ),
    http.get("*/api/v1/statuses/:id", () => {
      attempts += 1;
      return attempts === 1 ? HttpResponse.error() : HttpResponse.json(subject);
    }),
  );
  const { findByRole, findByText } = renderThreadDirectly();

  expect(await findByRole("alert")).toHaveTextContent(/connection failed/i);

  await userEvent.click(await findByRole("button", { name: "Retry" }));

  expect(await findByText("The post that was opened")).toBeInTheDocument();
});
