// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
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

// A fixture status whose id sorts newer than everything in `statuses` above
// (flake IDs are lexicographically comparable — plan doc).
const newerStatus = (id: string, content: string): Status => ({
  id,
  content: `<p>${content}</p>`,
  created_at: "2026-07-06T12:00:00.000Z",
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
});

// A full 40-item page: exactly at the server's clamp, which is how the
// store decides a refresh result "may have a gap" behind it (plan doc,
// "API 実測結果"). Newest-first (descending ids), like every real page and
// the segment model's invariant — Unit 3's gap tests reuse this fixture, and
// an ascending page would mask ordering bugs in appendOlder/applyRefresh.
const fullPage: Status[] = Array.from({ length: 40 }, (_, i) => {
  const suffix = 39 - i;
  return newerStatus(
    `12000000000000${String(suffix).padStart(4, "0")}`,
    `Full page item ${suffix}`,
  );
});

// MSW is the only mock seam (ADR-0009): tests exercise the real client,
// toResult, and page rendering; only HTTP is simulated.
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
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

test("refresh prepends newer statuses ahead of the existing ones", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      expect(sinceId).toBe(statuses[0]?.id);
      return HttpResponse.json([
        newerStatus("110000000000000003", "Brand new"),
      ]);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("Brand new")).toBeInTheDocument();
  // Existing content survives the refresh, not just the new item.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
});

test("a full-page refresh still renders the new statuses (gap resolution is Unit 3's job)", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      expect(sinceId).toBe(statuses[0]?.id);
      return HttpResponse.json(fullPage);
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText("Full page item 0")).toBeInTheDocument();
  expect(await findByText("Full page item 39")).toBeInTheDocument();
  // The old segment is still there too, just behind the (as yet unmarked)
  // gap boundary.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
});

test("a refresh failure surfaces a notice without blanking existing content", async () => {
  let refreshRequested = false;
  server.use(
    http.get("*/api/v1/timelines/home", ({ request }) => {
      const sinceId = new URL(request.url).searchParams.get("since_id");
      if (sinceId === null) return HttpResponse.json(statuses);
      refreshRequested = true;
      return HttpResponse.error();
    }),
  );
  const { findByText, findByRole } = renderTimeline();

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Refresh" }));

  expect(await findByText(/refresh failed/i)).toBeInTheDocument();
  expect(refreshRequested).toBe(true);
  // The existing cards are untouched by the failed refresh.
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(await findByText("Second fixture status")).toBeInTheDocument();
});
