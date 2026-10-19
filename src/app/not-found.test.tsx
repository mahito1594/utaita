// @vitest-environment happy-dom
// A path no route matches, as a reader opens it: the real App composition,
// only HTTP simulated via MSW (ADR-0009).
import { query } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Account } from "../pages/profile/profile-api";
import { boosts, whoListPath } from "../pages/thread/who-lists";
import { signIn } from "../test/sign-in";
import App from "./App";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  query.clear();
  window.history.replaceState(null, "", "/");
});
afterAll(() => server.close());

const expectNotFound = async (view: ReturnType<typeof render>) => {
  expect(await view.findByRole("alert")).toHaveTextContent(/not found/i);
  expect(view.getByRole("link", { name: /home/i })).toHaveAttribute(
    "href",
    "/",
  );
};

test("a path no route matches renders not-found with a link home while signed out", async () => {
  window.history.replaceState(null, "", "/statuses/1/typo");
  await expectNotFound(render(() => <App />));
});

test("a path no route matches renders not-found with a link home while signed in", async () => {
  await signIn(server);
  window.history.replaceState(null, "", "/statuses/1/typo");
  await expectNotFound(render(() => <App />));
});

test("a who-list path still matches its list, not the not-found page", async () => {
  const booster: Account = {
    id: "900000000000000008",
    acct: "bob",
    display_name: "Bob Example",
  };
  server.use(
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json({ ancestors: [], descendants: [] }),
    ),
    http.get("*/api/v1/statuses/:id/reblogged_by", () =>
      HttpResponse.json([booster]),
    ),
    http.get("*/api/v1/statuses/:id", () =>
      HttpResponse.json({
        id: "1",
        content: "<p>The post</p>",
        created_at: "2026-08-01T12:01:00.000Z",
        account: { id: "900000000000000001", acct: "alice" },
      }),
    ),
  );
  window.history.replaceState(null, "", whoListPath("1", boosts));
  const { findByText, queryByText } = render(() => <App />);

  expect(await findByText("Bob Example")).toBeInTheDocument();
  expect(queryByText(/not found/i)).not.toBeInTheDocument();
});
