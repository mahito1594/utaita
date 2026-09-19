// @vitest-environment happy-dom
// Page-level tests of the auth flow: real App composition (Router, gate,
// callback, header injection), only HTTP simulated via MSW (ADR-0009).
import { query } from "@solidjs/router";
import { cleanup, render, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  onTestFinished,
  test,
  vi,
} from "vitest";
import { completeLogin, logout } from "../entities/session/session";
import type { Status } from "../entities/status/StatusCard";
import type { Account } from "../pages/profile/profile-api";
import App from "./App";

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

// A deep link the reader could have followed while signed out — the case the
// return path exists for, since the timeline is what a lost destination falls
// back to and would be indistinguishable from success.
const THREAD_PATH = "/statuses/110000000000000002";

const threadSubject: Status = {
  id: "110000000000000002",
  content: "<p>The post that was opened</p>",
  created_at: "2026-08-01T12:01:00.000Z",
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
};

// The other shared URL a reader can arrive at without a session.
const PROFILE_PATH = "/accounts/alice@fixture.example";

const profileAccount: Account = {
  id: "900000000000000001",
  acct: "alice@fixture.example",
  display_name: "Alice Example",
  statuses_count: 0,
  following_count: 0,
  followers_count: 0,
};

// The account behind one of the post's counts. A different name from the
// post's own author, so the row it draws is unambiguous in the assertions.
const favouriter: Account = {
  id: "900000000000000002",
  acct: "bob",
  display_name: "Bob Local",
  statuses_count: 0,
  following_count: 0,
  followers_count: 0,
};

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

const tokenExchangeOk = () =>
  http.post("*/oauth/token", () =>
    HttpResponse.json({ access_token: "tok-1", token_type: "Bearer" }),
  );

// The thread route's preload runs on a match, gate or no gate, so these answer
// the signed-out visit as well as the refetch that follows the sign-in.
const threadOk = () => [
  http.get("*/api/v1/statuses/:id/context", () =>
    HttpResponse.json({ ancestors: [], descendants: [] }),
  ),
  http.get("*/api/v1/statuses/:id", () => HttpResponse.json(threadSubject)),
];

// Both requests the profile route makes: the account and the posts list (its
// pinned strip asks the same endpoint).
const profileOk = (seen?: (authorization: string | null) => void) => [
  http.get("*/api/v1/accounts/:id", ({ request }) => {
    seen?.(request.headers.get("Authorization"));
    return HttpResponse.json(profileAccount);
  }),
  http.get("*/api/v1/accounts/:id/statuses", ({ request }) => {
    seen?.(request.headers.get("Authorization"));
    return HttpResponse.json([]);
  }),
];

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

test("every timeline stays behind the gate while signed out", async () => {
  let timelineRequests = 0;
  server.use(
    http.get("*/api/v1/timelines/*", () => {
      timelineRequests += 1;
      return HttpResponse.json([]);
    }),
  );

  for (const path of ["/", "/local", "/bubble", "/federated"]) {
    window.history.replaceState(null, "", path);
    const { findByRole, queryByRole } = render(() => <App />);
    expect(await findByRole("button", { name: "Log in" })).toBeInTheDocument();
    // The switcher tabs are the shell's, so their absence is the gate
    // standing where the timeline would be (TimelineShell.tsx).
    expect(queryByRole("link", { name: "Federated" })).not.toBeInTheDocument();
    cleanup();
  }
  expect(timelineRequests).toBe(0);
});

test("a thread opened without a session renders and fetches anonymously", async () => {
  const authorizations: (string | null)[] = [];
  server.use(
    http.get("*/api/v1/statuses/:id/context", ({ request }) => {
      authorizations.push(request.headers.get("Authorization"));
      return HttpResponse.json({ ancestors: [], descendants: [] });
    }),
    http.get("*/api/v1/statuses/:id", ({ request }) => {
      authorizations.push(request.headers.get("Authorization"));
      return HttpResponse.json(threadSubject);
    }),
  );
  window.history.replaceState(null, "", THREAD_PATH);
  const { findByText, queryByRole } = render(() => <App />);

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((value) => value === null)).toBe(true);
  // Nothing to log out of: the header offers the way in, not the way out.
  expect(queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
});

test("a list under a post opened without a session renders and fetches anonymously", async () => {
  const authorizations: (string | null)[] = [];
  const seen = (request: Request) => {
    authorizations.push(request.headers.get("Authorization"));
  };
  server.use(
    http.get("*/api/v1/statuses/:id/favourited_by", ({ request }) => {
      seen(request);
      return HttpResponse.json([favouriter]);
    }),
    http.get("*/api/v1/statuses/:id/context", ({ request }) => {
      seen(request);
      return HttpResponse.json({ ancestors: [], descendants: [] });
    }),
    http.get("*/api/v1/statuses/:id", ({ request }) => {
      seen(request);
      return HttpResponse.json(threadSubject);
    }),
  );
  window.history.replaceState(null, "", `${THREAD_PATH}/favourited_by`);
  const { findByText } = render(() => <App />);

  expect(await findByText("Bob Local")).toBeInTheDocument();
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((value) => value === null)).toBe(true);
});

test("a profile opened without a session renders and fetches anonymously", async () => {
  const authorizations: (string | null)[] = [];
  server.use(...profileOk((value) => authorizations.push(value)));
  window.history.replaceState(null, "", PROFILE_PATH);
  const { findByRole } = render(() => <App />);

  expect(
    await findByRole("heading", { name: "Alice Example" }),
  ).toBeInTheDocument();
  expect(authorizations.length).toBeGreaterThan(0);
  expect(authorizations.every((value) => value === null)).toBe(true);
});

test("the header offers a sign-in from a page read without one", async () => {
  seedCredentials();
  server.use(...threadOk());
  window.history.replaceState(null, "", THREAD_PATH);
  const { findByText, findByRole } = render(() => <App />);
  expect(await findByText("The post that was opened")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Log in" }));

  expect(sessionStorage.getItem("utaita:return_path")).toBe(THREAD_PATH);
  expect(sessionStorage.getItem("utaita:oauth_state")).toMatch(
    /^[0-9a-f]{32}$/,
  );
});

test("signing in from a post that answered 404 brings the post itself back", async () => {
  // Akkoma answers an anonymous request for a private post with 404, so this
  // is what a follower-only post looks like before the sign-in.
  seedCredentials();
  let withSession = false;
  server.use(
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json({ ancestors: [], descendants: [] }),
    ),
    http.get("*/api/v1/statuses/:id", () =>
      withSession
        ? HttpResponse.json(threadSubject)
        : HttpResponse.json({ error: "Record not found" }, { status: 404 }),
    ),
  );
  window.history.replaceState(null, "", THREAD_PATH);
  const { findByText, findByRole } = render(() => <App />);

  const alert = await findByRole("alert");
  expect(alert).toHaveTextContent(/needs a sign-in to see/i);
  // The header offers one too; this is the one standing next to the failure.
  await userEvent.click(
    await within(alert).findByRole("button", { name: "Log in" }),
  );
  expect(sessionStorage.getItem("utaita:return_path")).toBe(THREAD_PATH);

  // The return leg: completeLogin flushes the query cache, so the page the
  // reader is still on fetches again rather than keeping the 404 it cached.
  withSession = true;
  await signIn();

  expect(await findByText("The post that was opened")).toBeInTheDocument();
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
  const { findByRole } = render(() => <App />);

  await userEvent.click(await findByRole("button", { name: "Log in" }));

  // Announced as an alert, and focus lands on it: disabling the clicked
  // button blurred it, so the error box is the explicit landing spot.
  const alert = await findByRole("alert");
  expect(alert).toHaveTextContent(/login failed \(422/i);
  expect(alert).toHaveFocus();
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

test("a sign-in started from a deep link comes back to it", async () => {
  seedCredentials();
  server.use(tokenExchangeOk(), ...threadOk());
  window.history.replaceState(null, "", THREAD_PATH);
  const view = render(() => <App />);

  // Outbound leg: the gate renders in place at the deep link, and the click
  // is what hands the round-trip both the nonce and the destination.
  await userEvent.click(await view.findByRole("button", { name: "Log in" }));
  const state = sessionStorage.getItem("utaita:oauth_state");
  expect(state).not.toBeNull();
  cleanup();

  // Return leg: the instance redirects to the callback path, which is all the
  // document has left to work from.
  window.history.replaceState(
    null,
    "",
    `/oauth-callback?code=code-1&state=${state}`,
  );
  const { findByText } = render(() => <App />);

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  // The address bar is the half that survives a reload or a share, and the
  // router commits the history entry a tick after the page it renders.
  await waitFor(() => expect(window.location.pathname).toBe(THREAD_PATH));
  // Spent by the landing: a later revisit of the callback must not replay it.
  expect(sessionStorage.getItem("utaita:return_path")).toBeNull();
});

test("a sign-in this tab started exchanges the code even with a token already stored", async () => {
  // A 401 does not clear the stored token, so the reader who signs in again
  // gets here with the expired one still in localStorage (ADR-0015).
  await signIn();
  sessionStorage.setItem("utaita:oauth_state", "nonce-2");
  let exchangedCode: string | undefined;
  server.use(
    http.post("*/oauth/token", async ({ request }) => {
      const body = new URLSearchParams(await request.text());
      exchangedCode = body.get("code") ?? undefined;
      return HttpResponse.json({ access_token: "tok-2", token_type: "Bearer" });
    }),
    homeTimelineOk(),
  );
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=code-2&state=nonce-2",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  expect(exchangedCode).toBe("code-2");
  expect(localStorage.getItem("utaita:access_token")).toBe("tok-2");
});

test("a return path pointing outside the app is refused", async () => {
  seedCredentials();
  sessionStorage.setItem("utaita:oauth_state", "nonce-1");
  // sessionStorage is writable by anything else running on this origin, so
  // what comes back out is untrusted regardless of what login() put in.
  sessionStorage.setItem("utaita:return_path", "//evil.example/statuses/1");
  server.use(tokenExchangeOk(), homeTimelineOk());
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=code-1&state=nonce-1",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText("Hello from fixture one")).toBeInTheDocument();
  await waitFor(() => expect(window.location.pathname).toBe("/"));
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

test("a revisit that is already signed in still honours the saved URL", async () => {
  // The token lives in localStorage, so another tab can sign this one in
  // while it sits on the authorize page; it returns with nothing to exchange
  // but with its own destination still saved.
  await signIn();
  sessionStorage.setItem("utaita:return_path", THREAD_PATH);
  server.use(...threadOk());
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=stale&state=stale",
  );
  const { findByText } = render(() => <App />);

  expect(await findByText("The post that was opened")).toBeInTheDocument();
});

test("the thread the sign-in came back to offers no back out of the app", async () => {
  // A history back from here would leave the SPA: the entry the return leg
  // replaced sits on top of the instance's own authorize page.
  await signIn();
  sessionStorage.setItem("utaita:return_path", THREAD_PATH);
  server.use(...threadOk());
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=stale&state=stale",
  );
  const { findByText, findByRole, queryByRole } = render(() => <App />);

  expect(await findByText("The post that was opened")).toBeInTheDocument();
  expect(await findByRole("link", { name: "Home" })).toBeInTheDocument();
  expect(queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  // The header has swapped sides: there is nothing left to log in to, on a
  // path where the gate screen is not the one offering it either.
  expect(queryByRole("button", { name: "Log in" })).not.toBeInTheDocument();
});

test("a list under a post the sign-in came back to offers no back out of the app", async () => {
  // The landing record is keyed by the whole pathname, so the tab segment has
  // to be part of what the who-lists route asks about (App.tsx).
  await signIn();
  sessionStorage.setItem("utaita:return_path", `${THREAD_PATH}/favourited_by`);
  server.use(
    ...threadOk(),
    http.get("*/api/v1/statuses/:id/favourited_by", () =>
      HttpResponse.json([]),
    ),
  );
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=stale&state=stale",
  );
  const { findByRole, queryByRole } = render(() => <App />);

  // The way out is a link to the post the list belongs to; a history back
  // would land on the instance's own authorize page.
  expect(await findByRole("link", { name: "Back" })).toHaveAttribute(
    "href",
    THREAD_PATH,
  );
  expect(queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
});

test("a thread opened after the sign-in has landed still offers the way back", async () => {
  // The landing is one arrival, not a mode: the record is spent by the
  // destination it named, and every thread after it is an ordinary push.
  await signIn();
  sessionStorage.setItem("utaita:return_path", "/");
  server.use(
    homeTimelineOk(),
    http.get("*/api/v1/statuses/:id/context", () =>
      HttpResponse.json({ ancestors: [], descendants: [] }),
    ),
    http.get("*/api/v1/statuses/:id", () => HttpResponse.json(statuses[0])),
  );
  window.history.replaceState(
    null,
    "",
    "/oauth-callback?code=stale&state=stale",
  );
  const { findByText, findByRole } = render(() => <App />);

  await userEvent.click(await findByText("Hello from fixture one"));

  expect(await findByRole("button", { name: "Back" })).toBeInTheDocument();
});

test("denied authorization comes back as a gate error", async () => {
  window.history.replaceState(null, "", "/oauth-callback?error=access_denied");
  const { findByText } = render(() => <App />);

  expect(
    await findByText(/authorization refused \(access_denied\)/i),
  ).toBeInTheDocument();
});

test("a sign-in refused over a stored token is reported, not swallowed", async () => {
  await signIn();
  sessionStorage.setItem("utaita:oauth_state", "nonce-2");
  window.history.replaceState(null, "", "/oauth-callback?error=access_denied");
  const { findByText } = render(() => <App />);

  expect(
    await findByText(/authorization refused \(access_denied\)/i),
  ).toBeInTheDocument();
  expect(sessionStorage.getItem("utaita:oauth_state")).toBeNull();
});

test("logout revokes the token, returns to the gate, and reloads the document", async () => {
  await signIn();
  let revoked = false;
  server.use(
    homeTimelineOk(),
    http.post("*/oauth/revoke", () => {
      revoked = true;
      return HttpResponse.json({});
    }),
  );
  // happy-dom's reload() re-fetches the document through its browser frame,
  // which would take this test out of MSW's reach; observing it is the point.
  // What it records is the ordering: a reload that fires before the revoke is
  // sent would abandon the round-trip with the token still valid.
  let whenReloaded: { revoked: boolean; token: string | null } | undefined;
  const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {
    whenReloaded = {
      revoked,
      token: localStorage.getItem("utaita:access_token"),
    };
  });
  onTestFinished(() => reload.mockRestore());
  const { findByRole, findByText } = render(() => <App />);
  expect(await findByText("Hello from fixture one")).toBeInTheDocument();

  await userEvent.click(await findByRole("button", { name: "Log out" }));

  expect(await findByRole("button", { name: "Log in" })).toBeInTheDocument();
  expect(revoked).toBe(true);
  expect(localStorage.getItem("utaita:access_token")).toBeNull();
  await waitFor(() =>
    expect(whenReloaded).toEqual({ revoked: true, token: null }),
  );
});
