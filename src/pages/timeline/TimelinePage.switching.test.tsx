// @vitest-environment happy-dom
// Switching behavior across the four timelines (Unit 1's per-timeline
// fetchers exercised at the page level, per ADR-0009): which endpoint/query
// each tab hits, that a tab click remounts to a fresh store rather than
// reusing the previous timeline's content, that the active tab is marked
// via `aria-current`, and that the tab keeps keyboard focus across the
// switch it triggered.
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { TimelinePage } from "./TimelinePage";
import { TimelineShell } from "./TimelineShell";
import { bubble, federated, home, local } from "./timelines";

const statusOn = (endpoint: string, id: string): Status => ({
  id,
  content: `<p>${endpoint} post</p>`,
  created_at: "2026-08-08T12:00:00.000Z",
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

const homeStatus = statusOn("home", "110000000000000001");
const localStatus = statusOn("local", "110000000000000002");
const bubbleStatus = statusOn("bubble", "110000000000000003");
const federatedStatus = statusOn("federated", "110000000000000004");

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // happy-dom keeps one window per file, and its scroll offset is plain
  // stored state that `cleanup()` does not touch.
  window.scrollTo(0, 0);
});
afterAll(() => server.close());

/**
 * Lets a response that settled at the HTTP boundary reach the page that asked.
 *
 * The count is empirical, and generous on purpose: the assertion it serves is
 * a negative one, so a wait that ends too early would not flake — it would
 * silently stop protecting anything. Ten ticks cost nothing here, and the
 * stray scroll this guards against was verified to land well inside them
 * (assert against a build with the disposal guard removed when touching this).
 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

// Mirrors App.tsx's route table (one `<Route>` per timeline under a shared
// shell route, each leaf a thin wrapper passing its own definition) — the
// same structure that guarantees a tab switch remounts `TimelinePage` while
// leaving the shell's tabs mounted.
const renderApp = () =>
  render(() => (
    <MemoryRouter>
      <Route component={TimelineShell}>
        <Route
          path={home.path}
          component={() => <TimelinePage timeline={home} />}
        />
        <Route
          path={local.path}
          component={() => <TimelinePage timeline={local} />}
        />
        <Route
          path={bubble.path}
          component={() => <TimelinePage timeline={bubble} />}
        />
        <Route
          path={federated.path}
          component={() => <TimelinePage timeline={federated} />}
        />
      </Route>
    </MemoryRouter>
  ));

test("switching to Local requests /public with local=true, and the home content is gone (fresh store on remount)", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/public", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("local")).toBe("true");
      return HttpResponse.json([localStatus]);
    }),
  );
  const { findByText, findByRole, queryByText } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Local" }));

  expect(await findByText("local post")).toBeInTheDocument();
  // A fresh store, not the home store carrying its segments across a param
  // change: the previous timeline's content is gone, not merged alongside.
  expect(queryByText("home post")).not.toBeInTheDocument();
});

test("switching to Federated requests /public without local", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/public", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.has("local")).toBe(false);
      return HttpResponse.json([federatedStatus]);
    }),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Federated" }));

  expect(await findByText("federated post")).toBeInTheDocument();
});

test("switching to Bubble requests /api/v1/timelines/bubble", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/bubble", () =>
      HttpResponse.json([bubbleStatus]),
    ),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();

  await userEvent.click(await findByRole("link", { name: "Bubble" }));

  expect(await findByText("bubble post")).toBeInTheDocument();
});

test("the active tab carries aria-current=page and it moves to the tab navigated to", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/public", ({ request }) => {
      const url = new URL(request.url);
      return url.searchParams.get("local") === "true"
        ? HttpResponse.json([localStatus])
        : HttpResponse.json([federatedStatus]);
    }),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();
  expect(await findByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await findByRole("link", { name: "Local" })).not.toHaveAttribute(
    "aria-current",
  );

  await userEvent.click(await findByRole("link", { name: "Local" }));

  expect(await findByText("local post")).toBeInTheDocument();
  expect(await findByRole("link", { name: "Local" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await findByRole("link", { name: "Home" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("the activated tab keeps keyboard focus across the switch, and stays the same element", async () => {
  // Contract: the switcher lives in TimelineShell, whose route definition is
  // shared by all four leaves, so the nav survives the remount of the page
  // below it. Rendered inside the page instead, activating a tab would
  // destroy the very `<a>` that has focus and drop it to <body> — leaving a
  // keyboard user to tab from the top of the document again on every switch.
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/public", () =>
      HttpResponse.json([localStatus]),
    ),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();

  const localTab = await findByRole("link", { name: "Local" });
  await userEvent.click(localTab);

  expect(await findByText("local post")).toBeInTheDocument();
  expect(document.activeElement).toBe(localTab);
  // The same element, not a replacement that merely looks alike — a
  // recreated nav would fail the focus assertion but this makes the reason
  // explicit.
  expect(await findByRole("link", { name: "Local" })).toBe(localTab);
});

test("the bar's Refresh drives the timeline switched to, not the one it was first mounted with", async () => {
  // The shell's button outlives the page it acts on, so which store it
  // drives is decided by what the mounted page published — the one contract
  // that a plain `setControls(undefined)` withdrawal would break silently
  // under a create-then-dispose ordering, leaving Refresh a no-op on every
  // timeline except the one first landed on.
  const newerLocalStatus = statusOn("newer local", "110000000000000009");
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([homeStatus])),
    http.get("*/api/v1/timelines/public", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("local")).toBe("true");
      return url.searchParams.get("since_id") === localStatus.id
        ? HttpResponse.json([newerLocalStatus])
        : HttpResponse.json([localStatus]);
    }),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();
  await userEvent.click(await findByRole("link", { name: "Local" }));
  expect(await findByText("local post")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  // The forward fetch went to Local's endpoint anchored at Local's head, and
  // its outcome reached the announcement channel of the page now mounted.
  expect(await findByText("newer local post")).toBeInTheDocument();
  expect(await findByText("1 new post loaded")).toBeInTheDocument();
});

test("a refresh that settles after its page is gone leaves the switched-to timeline where the reader put it", async () => {
  // `store.refresh()` cannot be cancelled, so the page's disposal guard is
  // the only thing between a slow forward fetch and a viewport it no longer
  // owns — `window.scrollTo` is global. A stray scroll here would also read
  // as "the reader took over" to `<Router scrollRestoration>` (App.tsx).
  let releaseRefresh: (() => void) | undefined;
  const refreshHeld = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const newerHomeStatus = statusOn("newer home", "110000000000000009");
  server.use(
    http.get("*/api/v1/timelines/home", async ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("since_id") === null)
        return HttpResponse.json([homeStatus]);
      await refreshHeld;
      return HttpResponse.json([newerHomeStatus]);
    }),
    http.get("*/api/v1/timelines/public", () =>
      HttpResponse.json([localStatus]),
    ),
  );
  const { findByText, findByRole } = renderApp();

  expect(await findByText("home post")).toBeInTheDocument();
  await userEvent.click(await findByRole("button", { name: "Refresh" }));
  await userEvent.click(await findByRole("link", { name: "Local" }));
  expect(await findByText("local post")).toBeInTheDocument();
  // The reader has settled into the timeline they switched to.
  window.scrollTo(0, 500);

  releaseRefresh?.();
  await settle();

  expect(window.scrollY).toBe(500);
});
