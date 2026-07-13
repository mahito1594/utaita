// @vitest-environment happy-dom
import { MemoryRouter, query, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { TimelinePage } from "./TimelinePage";

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment).
const statuses: Status[] = [
  {
    id: "110000000000000001",
    content: "<p>Hello from fixture one</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  },
  {
    id: "110000000000000002",
    content: "<p>Second fixture status</p>",
    created_at: "2026-07-05T11:00:00.000Z",
    account: {
      id: "900000000000000002",
      acct: "bob",
      display_name: "Bob Local",
    },
  },
];

// MSW is the only mock seam (ADR-0009): tests exercise the real client,
// toResult, query and page rendering; only HTTP is simulated.
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // query's cache is module-level; without this, an Err cached by one test
  // leaks into the next.
  query.clear();
});
afterAll(() => server.close());

const renderTimeline = () =>
  render(() => (
    <MemoryRouter>
      <Route path="/" component={TimelinePage} />
    </MemoryRouter>
  ));

test("renders fetched statuses as cards", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json(statuses)),
  );
  const { findByText } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
  expect(await findByText("Alice Example")).toBeInTheDocument();
});

test("renders a sign-in prompt when the timeline answers 401", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json(
        { error: "authorization required for timeline view" },
        { status: 401 },
      ),
    ),
  );
  const { findByRole } = renderTimeline();

  // role="alert" so the error is announced, not merely painted.
  expect(await findByRole("alert")).toHaveTextContent(/sign-in required/i);
});

test("renders a sign-in prompt when the timeline answers 403", async () => {
  // The real shape of an unauthenticated home timeline (Akkoma answers 403
  // there, 401 on public — verified against the reference instance).
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json({ error: "Invalid credentials." }, { status: 403 }),
    ),
  );
  const { findByText } = renderTimeline();

  expect(await findByText(/sign-in required/i)).toBeInTheDocument();
});

test("renders a retry affordance when the network fails", async () => {
  server.use(http.get("*/api/v1/timelines/home", () => HttpResponse.error()));
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText(/connection failed/i)).toBeInTheDocument();
  expect(await findByRole("button", { name: "Retry" })).toBeInTheDocument();
});
