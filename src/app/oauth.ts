// Functional core of the OAuth flow: URL building and callback parsing as
// pure functions (tested with plain Vitest, no DOM, ADR-0009). Storage and
// navigation side effects live in session.ts.

export const REDIRECT_PATH = "/oauth-callback";

// Register once with the full scope set (registration carries no capability
// by itself), request tokens with only what the current phase uses — the
// read-only MVP asks for `read` (ADR-0003).
export const REGISTRATION_SCOPES = "read write follow push";
export const TOKEN_SCOPE = "read";

export const buildAuthorizeUrl = (params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string =>
  `/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: TOKEN_SCOPE,
    state: params.state,
  })}`;

export type CallbackParams =
  // `state` is required-but-nullable: parsing always evaluates it, so "key
  // absent" would be a meaningless third state (exactOptionalPropertyTypes).
  | { kind: "code"; code: string; state: string | undefined }
  // The instance redirected back with an OAuth error (e.g. access_denied
  // when the user refused the authorization prompt).
  | { kind: "denied"; error: string }
  // Someone landed on the callback path without OAuth params at all.
  | { kind: "invalid" };

export const parseCallbackParams = (search: string): CallbackParams => {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error !== null) return { kind: "denied", error };
  const code = params.get("code");
  if (code !== null)
    return { kind: "code", code, state: params.get("state") ?? undefined };
  return { kind: "invalid" };
};

// CSRF mitigation: without PKCE (Akkoma doesn't implement it, ADR-0003) the
// state round-trip is the one cheap defense against login CSRF. A missing
// value on either side is a mismatch, never a pass.
export const generateState = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const stateMatches = (
  expected: string | undefined,
  received: string | undefined,
): boolean =>
  expected !== undefined && received !== undefined && expected === received;
