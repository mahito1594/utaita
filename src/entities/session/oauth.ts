// Functional core of the OAuth flow: URL building and callback parsing as
// pure functions (tested with plain Vitest, no DOM, ADR-0009). Storage and
// navigation side effects live in session.ts.

export const REDIRECT_PATH = "/oauth-callback";

// Register once with the full scope set (registration carries no capability
// by itself), request tokens with only what the current phase uses (ADR-0003).
export const REGISTRATION_SCOPES = "read write follow push";
const TOKEN_SCOPE = "read write";

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
    // Without it Akkoma answers a session cookie holding a valid token with
    // `?access_token=` instead of a code (issue #56).
    force_login: "true",
  })}`;

// A reissued token or a form posted with scopes unticked can grant less than
// was requested; a token without both is not a session this app supports
// (ADR-0003).
export const grantsReadWrite = (scope: string): boolean => {
  const granted = new Set(scope.split(/\s+/));
  return granted.has("read") && granted.has("write");
};

export type CallbackParams =
  // `state` is required-but-nullable: parsing always evaluates it, so "key
  // absent" would be a meaningless third state (exactOptionalPropertyTypes).
  | { kind: "code"; code: string; state: string | undefined }
  // The instance redirected back with an OAuth error. Akkoma's Cancel is a
  // link to `/` and never lands here, but RFC 6749 §4.1.2.1 allows this reply.
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

// A base that no instance can be served from (`.invalid` is reserved,
// RFC 2606), so "resolves against this origin" means "carries no origin of
// its own" — the only kind of destination this app may navigate to.
const RESOLUTION_BASE = "https://return-path.invalid";

/**
 * Parse a remembered sign-in destination into an in-app path, or `undefined`
 * when it is not one. The value crosses the authorization round-trip in
 * sessionStorage, which any same-origin script can write, so it is untrusted
 * input on the way back and is parsed once, here, before it can reach
 * `navigate`.
 *
 * Resolving it as a URL rather than matching the string is what makes the
 * evasions fail: the URL parser strips tabs and newlines and folds
 * backslashes, so `"/\n//evil.com"` and `"/\evil.com"` only show themselves as
 * off-origin afterwards.
 */
export const parseReturnPath = (raw: string | null): string | undefined => {
  if (raw === null) return undefined;
  let resolved: URL;
  try {
    resolved = new URL(raw, RESOLUTION_BASE);
  } catch {
    return undefined;
  }
  if (resolved.origin !== RESOLUTION_BASE) return undefined;
  // Returning to the callback would replay a spent code and nonce onto the
  // failure screen. This is reached when the reader retries from that screen,
  // where the current location is the callback itself.
  if (resolved.pathname === REDIRECT_PATH) return undefined;
  const path = resolved.pathname + resolved.search + resolved.hash;
  // `/..//evil.com` resolves to the pathname `//evil.com`: same origin as
  // parsed, but protocol-relative again the moment it is used as a path.
  return path.startsWith("//") ? undefined : path;
};
