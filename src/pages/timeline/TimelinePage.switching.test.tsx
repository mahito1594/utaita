// @vitest-environment happy-dom
// Switching behavior across the four timelines (Unit 1's per-timeline
// fetchers exercised at the page level, per ADR-0009): which endpoint/query
// each tab hits, that a tab click remounts to a fresh store rather than
// reusing the previous timeline's content, and that the active tab is
// marked via `aria-current`.
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { TimelinePage } from "./TimelinePage";
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
});
afterAll(() => server.close());

// Mirrors App.tsx's route table (one `<Route>` per timeline, each a thin
// wrapper passing its own definition) — the same structure that guarantees
// a tab switch remounts `TimelinePage` rather than reusing its instance.
const renderApp = () =>
  render(() => (
    <MemoryRouter>
      <Route path="/" component={() => <TimelinePage timeline={home} />} />
      <Route
        path="/local"
        component={() => <TimelinePage timeline={local} />}
      />
      <Route
        path="/bubble"
        component={() => <TimelinePage timeline={bubble} />}
      />
      <Route
        path="/federated"
        component={() => <TimelinePage timeline={federated} />}
      />
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
