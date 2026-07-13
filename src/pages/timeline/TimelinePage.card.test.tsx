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

test("a boost flattens into one card with a boost line", async () => {
  const boost: Status = {
    id: "110000000000000010",
    created_at: "2026-07-05T13:00:00.000Z",
    account: {
      id: "900000000000000002",
      acct: "bob",
      display_name: "Bob Booster",
    },
    reblog: {
      id: "110000000000000001",
      content: "<p>Original words</p>",
      created_at: "2026-07-05T12:00:00.000Z",
      account: {
        id: "900000000000000001",
        acct: "alice@fixture.example",
        display_name: "Alice Example",
      },
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([boost])),
  );
  const { findByText } = renderApp();

  expect(await findByText(/boosted by/)).toHaveTextContent(
    "boosted by Bob Booster",
  );
  expect(await findByText("Original words")).toBeInTheDocument();
  expect(await findByText("Alice Example")).toBeInTheDocument();
});

test("a reply shows the reply-to line above the body", async () => {
  const reply: Status = {
    id: "110000000000000011",
    content: "<p>An answer</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    in_reply_to_id: "110000000000000001",
    pleroma: { in_reply_to_account_acct: "dave@fixture.example" },
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([reply])),
  );
  const { findByText } = renderApp();

  expect(await findByText(/replying to/)).toHaveTextContent(
    "replying to @dave@fixture.example",
  );
});

test("display names render custom emoji as images", async () => {
  const emojiName: Status = {
    id: "110000000000000012",
    content: "<p>text</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice :party:",
      emojis: [
        { shortcode: "party", url: "https://fixture.example/emoji/party.png" },
      ],
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([emojiName])),
  );
  const { findByAltText } = renderApp();

  expect(await findByAltText(":party:")).toBeInTheDocument();
});

test("a content warning hides the body until expanded, without unmounting it", async () => {
  const cwStatus: Status = {
    id: "110000000000000013",
    content: "<p>Spoiled contents</p>",
    spoiler_text: "CW: the reveal",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([cwStatus])),
  );
  const { findByRole, findByText } = renderApp();

  const toggle = await findByRole("button", { name: "CW: the reveal" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // Present in the DOM (hidden, not unmounted) but invisible.
  expect(await findByText("Spoiled contents")).not.toBeVisible();

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await findByText("Spoiled contents")).toBeVisible();
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
