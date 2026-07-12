// @vitest-environment happy-dom
// Page-level tests of the auth flow: real App composition (Router, gate,
// callback, header injection), only HTTP simulated via MSW (ADR-0009).
import { query } from "@solidjs/router";
import { cleanup, render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../entities/status/StatusCard";
import App from "./App";
import { completeLogin, logout } from "./session";

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
];

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(async () => {
  server.resetHandlers();
  cleanup();
  query.clear();
  // The session signal is module-level; clear storage first so logout()
  // resets it without attempting a network revoke.
  localStorage.clear();
  sessionStorage.clear();
  await logout();
  window.history.replaceState(null, "", "/");
});
afterAll(() => server.close());

const seedCredentials = () => {
  localStorage.setItem("utaita:client_id", "cid-1");
  localStorage.setItem("utaita:client_secret", "sec-1");
};

// Reaches the authenticated state through the public flow (seeding the
// signal directly is impossible by design — it is not exported).
const signIn = async () => {
  seedCredentials();
  sessionStorage.setItem("utaita:oauth_state", "nonce-1");
  server.use(
    http.post("*/oauth/token", () =>
      HttpResponse.json({ access_token: "tok-1", token_type: "Bearer" }),
    ),
  );
  const result = await completeLogin("code-1", "nonce-1");
  expect(result.ok).toBe(true);
};

const homeTimelineOk = () =>
  http.get("*/api/v1/timelines/home", () => HttpResponse.json(statuses));

test("unauthenticated visit renders the login gate without probing the API", async () => {
  // The route preload is gated on the session; a request here could only
  // cache a 401 that completeLogin would have to flush again.
  let timelineRequested = false;
  server.use(
    http.get("*/api/v1/timelines/home", () => {
      timelineRequested = true;
      return HttpResponse.json(
        { error: "Invalid credentials." },
        { status: 403 },
      );
    }),
  );
  const { findByRole, queryByText } = render(() => <App />);

  expect(await findByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(queryByText("Hello from fixture one")).not.toBeInTheDocument();
  expect(timelineRequested).toBe(false);
});

test("first login registers the app and heads to authorize", async () => {
  server.use(
    http.post("*/api/v1/apps", () =>
      HttpResponse.json({ client_id: "cid-9", client_secret: "sec-9" }),
    ),
  );
  const { findByRole, findByText } = render(() => <App />);

  await userEvent.click(await findByRole("button", { name: "Log in" }));

  expect(await findByText(/redirecting/i)).toBeInTheDocument();
  expect(localStorage.getItem("utaita:client_id")).toBe("cid-9");
  expect(localStorage.getItem("utaita:client_secret")).toBe("sec-9");
  expect(sessionStorage.getItem("utaita:oauth_state")).toMatch(
    /^[0-9a-f]{32}$/,
  );
});

test("login with stored credentials skips registration", async () => {
  // No /api/v1/apps handler is registered on purpose: with
  // onUnhandledRequest "error", a re-registration attempt fails this test.
  // Registration is once per origin, then reused (ADR-0003).
  seedCredentials();
  const { findByRole, findByText } = render(() => <App />);

  await userEvent.click(await findByRole("button", { name: "Log in" }));

  expect(await findByText(/redirecting/i)).toBeInTheDocument();
  expect(localStorage.getItem("utaita:client_id")).toBe("cid-1");
});

test("bfcache restore unfreezes the busy login button", async () => {
  server.use(
    http.post("*/api/v1/apps", () =>
      HttpResponse.json({ client_id: "cid-9", client_secret: "sec-9" }),
    ),
  );
  const { findByRole, findByText } = render(() => <App />);

  await userEvent.click(await findByRole("button", { name: "Log in" }));
  expect(await findByText(/redirecting/i)).toBeInTheDocument();

  // Simulate the browser thawing the page from the bfcache after "Back":
  // no remount happens, only a pageshow event with `persisted` set.
  const pageshow = new Event("pageshow");
  Object.defineProperty(pageshow, "persisted", { value: true });
  window.dispatchEvent(pageshow);

  expect(await findByRole("button", { name: "Log in" })).toBeEnabled();
});

test("registration failure surfaces on the gate with retry", async () => {
  server.use(
    http.post("*/api/v1/apps", () =>
      HttpResponse.json({ error: "invalid request" }, { status: 422 }),
    ),
  );
  const { findByRole, findByText } = render(() => <App />);

  await userEvent.click(await findByRole("button", { name: "Log in" }));

  expect(await findByText(/login failed \(422/i)).toBeInTheDocument();
  // The button doubles as the retry affordance (wireframe decision).
  expect(await findByRole("button", { name: "Log in" })).toBeEnabled();
});

test("callback exchanges the code, injects the token, and lands on the timeline", async () => {
  seedCredentials();
  sessionStorage.setItem("utaita:oauth_state", "nonce-1");
  let timelineAuthHeader: string | null = null;
  server.use(
    http.post("*/oauth/token", async ({ request }) => {
      const body = new URLSearchParams(await request.text());
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("code-1");
      expect(body.get("client_id")).toBe("cid-1");
      return HttpResponse.json({ access_token: "tok-1", token_type: "Bearer" });
    }),
    http.get("*/api/v1/timelines/home", ({ request }) => {
      timelineAuthHeader = request.headers.get("Authorization");
      return HttpResponse.json(statuses);
    }),
  );
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=code-1&state=nonce-1",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(localStorage.getItem("utaita:access_token")).toBe("tok-1");
  expect(timelineAuthHeader).toBe("Bearer tok-1");
});

test("callback with a mismatched state stores no token", async () => {
  seedCredentials();
  sessionStorage.setItem("utaita:oauth_state", "nonce-right");
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=code-1&state=nonce-wrong",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText(/state mismatch/i)).toBeInTheDocument();
  expect(localStorage.getItem("utaita:access_token")).toBeNull();
});

test("empty access_token in the exchange response is rejected, not stored", async () => {
  seedCredentials();
  sessionStorage.setItem("utaita:oauth_state", "nonce-1");
  server.use(
    http.post("*/oauth/token", () => HttpResponse.json({ access_token: "" })),
  );
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=code-1&state=nonce-1",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText(/malformed token response/i)).toBeInTheDocument();
  expect(localStorage.getItem("utaita:access_token")).toBeNull();
});

test("revisiting the callback while signed in goes home instead of erroring", async () => {
  await signIn();
  server.use(homeTimelineOk());
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=stale&state=stale",
  );
  const { findByText, queryByText } = render(() => <App />);

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(queryByText(/state mismatch/i)).not.toBeInTheDocument();
});

test("denied authorization comes back as a gate error", async () => {
  window.history.replaceState(null, "", "/oauth-callback?error=access_denied");
  const { findByText } = render(() => <App />);

  expect(
    await findByText(/authorization refused \(access_denied\)/i),
  ).toBeInTheDocument();
});

test("logout revokes the token and returns to the gate", async () => {
  await signIn();
  let revoked = false;
  server.use(
    homeTimelineOk(),
    http.post("*/oauth/revoke", () => {
      revoked = true;
      return HttpResponse.json({});
    }),
  );
  const { findByRole, findByText } = render(() => <App />);
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Log out" }));

  expect(await findByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(revoked).toBe(true);
  expect(localStorage.getItem("utaita:access_token")).toBeNull();
});
