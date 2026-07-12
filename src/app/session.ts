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
  REDIRECT_PATH,
  REGISTRATION_SCOPES,
  stateMatches,
} from "./oauth";

// Flow-level failures (state mismatch, missing registration) are not API
// errors but still travel as values to the same login screen (ADR-0008).
export type SessionError = ApiError | { kind: "flow"; message: string };

// sessionStorage, not localStorage: the state nonce must not outlive the
// tab that started the authorization round-trip.
const STATE_KEY = "utaita:oauth_state";

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
