// @vitest-environment happy-dom
// Card-behavior tests through the timeline page (ADR-0009: observable
// behavior at page level; the pipeline internals are covered in
// entities/status/content.test.ts under jsdom).
import { MemoryRouter, query, Route } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { ProfilePage } from "../profile/ProfilePage";
import { TimelinePage } from "./TimelinePage";

const mentionStatus: Status = {
  id: "110000000000000001",
  content:
    '<p>hi <a class="u-url mention" href="https://fixture.example/users/carol">@carol</a></p>',
  created_at: "2026-07-05T12:00:00.000Z",
  mentions: [
    {
      id: "900000000000000003",
      acct: "carol@fixture.example",
      username: "carol",
      url: "https://fixture.example/users/carol",
    },
  ],
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  query.clear();
});
afterAll(() => server.close());

const renderApp = () =>
  render(() => (
    <MemoryRouter>
      <Route path="/" component={TimelinePage} />
      <Route path="/users/:acct" component={ProfilePage} />
    </MemoryRouter>
  ));

test("a mention tap navigates to the in-app profile page", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([mentionStatus]),
    ),
  );
  const { findByRole, findByText } = renderApp();

  const mention = await findByRole("link", { name: "@carol" });
  await userEvent.click(mention);

  expect(await findByText("@carol@fixture.example")).toBeInTheDocument();
  expect(await findByText(/not implemented/i)).toBeInTheDocument();
});

test("external links are decorated to open in a new tab", async () => {
  const linkStatus: Status = {
    id: "110000000000000002",
    content: '<p><a href="https://elsewhere.test/article">read this</a></p>',
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([linkStatus])),
  );
  const { findByRole } = renderApp();

  const link = await findByRole("link", { name: "read this" });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
