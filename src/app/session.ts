// Imperative shell of the OAuth flow: storage, redirects, and the reactive
// session signal the gate renders from. The pure pieces live in ./oauth.
import { revalidate } from "@solidjs/router";
import { createSignal } from "solid-js";
import { type ApiError, client, toResult } from "../api/client";
import { exchangeCode, revokeToken } from "../api/oauth";
import { err, ok, type Result } from "../api/result";
import {
  type AppCredentials,
  clearToken,
  loadCredentials,
  loadToken,
  saveCredentials,
  saveToken,
} from "../api/token-store";
import {
  buildAuthorizeUrl,
  generateState,
  parseReturnPath,
  REDIRECT_PATH,
  REGISTRATION_SCOPES,
  stateMatches,
} from "./oauth";

// Flow-level failures (state mismatch, missing registration) are not API
// errors but still travel as values to the same login screen (ADR-0008).
export type SessionError = ApiError | { kind: "flow"; message: string };

// sessionStorage, not localStorage: neither the state nonce nor the place to
// come back to may outlive the tab that started the authorization round-trip.
const STATE_KEY = "utaita:oauth_state";
const RETURN_KEY = "utaita:return_path";

const [authenticated, setAuthenticated] = createSignal(
  loadToken() !== undefined,
);

export { authenticated };

const redirectUri = (): string => window.location.origin + REDIRECT_PATH;

// Registration happens at most once per origin (ADR-0003); afterwards the
// stored credentials are reused for every login.
const ensureCredentials = async (): Promise<
  Result<AppCredentials, SessionError>
> => {
  const existing = loadCredentials();
  if (existing !== undefined) return ok(existing);
  const result = await toResult(
    client.POST("/api/v1/apps", {
      body: {
        client_name: "utaita",
        redirect_uris: redirectUri(),
        scopes: REGISTRATION_SCOPES,
      },
    }),
  );
  if (!result.ok) return result;
  const { client_id, client_secret } = result.value;
  if (typeof client_id !== "string" || typeof client_secret !== "string") {
    return err({
      kind: "flow",
      message: "malformed app registration response",
    });
  }
  const credentials = { clientId: client_id, clientSecret: client_secret };
  saveCredentials(credentials);
  return ok(credentials);
};

// Ok means "navigating away to the instance's authorize page" — the caller
// should stay in its busy state. Err comes back for the login screen.
export const login = async (): Promise<Result<void, SessionError>> => {
  const credentials = await ensureCredentials();
  if (!credentials.ok) return credentials;
  const state = generateState();
  sessionStorage.setItem(STATE_KEY, state);
  // The gate renders in place at whatever URL was opened, so the current
  // location is the destination — a deep link into a thread as much as the
  // timeline. Nothing is written when the location is not a destination (a
  // retry from the callback screen): the entry already there is the deep link
  // that started the attempt that just failed.
  const returnPath = parseReturnPath(
    window.location.pathname + window.location.search + window.location.hash,
  );
  if (returnPath !== undefined) sessionStorage.setItem(RETURN_KEY, returnPath);
  window.location.assign(
    buildAuthorizeUrl({
      clientId: credentials.value.clientId,
      redirectUri: redirectUri(),
      state,
    }),
  );
  return ok(undefined);
};

export const completeLogin = async (
  code: string,
  state: string | undefined,
): Promise<Result<void, SessionError>> => {
  const expected = sessionStorage.getItem(STATE_KEY) ?? undefined;
  sessionStorage.removeItem(STATE_KEY);
  if (!stateMatches(expected, state)) {
    return err({ kind: "flow", message: "state mismatch — retry the login" });
  }
  const credentials = loadCredentials();
  if (credentials === undefined) {
    return err({
      kind: "flow",
      message: "no registered app — retry the login",
    });
  }
  const token = await exchangeCode({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    code,
    redirectUri: redirectUri(),
  });
  if (!token.ok) return token;
  saveToken(token.value.access_token);
  setAuthenticated(true);
  // Preloads that ran before login cached 401/403 Results; flush everything
  // so the now-authenticated pages refetch (discussion decision 2026-07-12).
  await revalidate();
  return ok(undefined);
};

/**
 * Where the return leg has just landed, answered once and only to the arrival
 * it names. The leg replaces the callback's own history entry, so the router
 * reports an ordinary navigation while the instance's authorize page stands
 * behind it — which a page offering a history back has to know
 * (open-thread.ts holds the same consume-once shape).
 */
let landing: string | undefined;

export const takeSignInLanding = (pathname: string): boolean => {
  const landed = landing === pathname;
  landing = undefined;
  return landed;
};

// Where the return leg should land. Read once and cleared, because the
// destination is spent by the navigation it feeds; a failed exchange leaves it
// in place instead, so a retry still knows where the reader was going.
// Anything unusable — absent, off-origin, or planted by other same-origin code
// — collapses to the timeline (parseReturnPath).
export const takeReturnPath = (): string => {
  const stored = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  const path = parseReturnPath(stored) ?? "/";
  // A page asks by pathname: the query and hash are the destination's, not
  // the route's.
  landing = new URL(path, window.location.origin).pathname;
  return path;
};

export const logout = async (): Promise<void> => {
  const credentials = loadCredentials();
  const token = loadToken();
  // Local state goes first: revoke is best effort, and a slow or failed
  // round-trip must not keep the UI signed in. Clearing the token up front
  // also makes a second click a no-op instead of a duplicate revoke.
  clearToken();
  setAuthenticated(false);
  if (credentials !== undefined && token !== undefined) {
    await revokeToken({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      token,
    });
  }
};
