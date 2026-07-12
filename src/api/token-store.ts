// The one place credentials and tokens are persisted (localStorage, per
// ADR-0003). Deliberately a concrete module, not an injected interface:
// the fetch wrapper and the session shell both import it directly, and
// tests seed localStorage instead of mocking (ADR-0009).
//
// localStorage is origin-scoped, which is load-bearing: each origin
// (localhost, LAN IP, production host) registers its own OAuth app, so the
// stored client credentials always match the redirect_uri the instance
// validates by exact match.

export type AppCredentials = { clientId: string; clientSecret: string };

const CLIENT_ID = "utaita:client_id";
const CLIENT_SECRET = "utaita:client_secret";
const ACCESS_TOKEN = "utaita:access_token";

export const loadCredentials = (): AppCredentials | undefined => {
  const clientId = localStorage.getItem(CLIENT_ID);
  const clientSecret = localStorage.getItem(CLIENT_SECRET);
  return clientId !== null && clientSecret !== null
    ? { clientId, clientSecret }
    : undefined;
};

export const saveCredentials = ({
  clientId,
  clientSecret,
}: AppCredentials): void => {
  localStorage.setItem(CLIENT_ID, clientId);
  localStorage.setItem(CLIENT_SECRET, clientSecret);
};

export const loadToken = (): string | undefined =>
  localStorage.getItem(ACCESS_TOKEN) ?? undefined;

export const saveToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN, token);
};

// Logout drops the token only. Credentials survive: app registration is
// once per origin (ADR-0003) and stays valid for the next login.
export const clearToken = (): void => {
  localStorage.removeItem(ACCESS_TOKEN);
};
