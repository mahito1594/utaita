// Hand-written transport for OAuth endpoints the instance spec does not
// declare: openapi.json mentions /oauth/token and /oauth/authorize only as
// security-scheme URLs, not as paths, so the generated client cannot type
// them. Same-origin, form-encoded, folded into Result like everything else
// (ADR-0008).
import { type ApiError, errorMessage } from "./client";
import { err, ok, type Result } from "./result";

// Only the field the app consumes. Akkoma sends more (token_type, scope,
// created_at); model them when a caller actually needs them.
export type TokenResponse = { access_token: string };

// Parse, don't validate: narrow the untyped body without type assertions,
// so a future shape change fails here instead of downstream.
const parseTokenResponse = (body: unknown): TokenResponse | undefined =>
  typeof body === "object" &&
  body !== null &&
  "access_token" in body &&
  typeof body.access_token === "string" &&
  body.access_token !== ""
    ? { access_token: body.access_token }
    : undefined;

const postForm = async (
  path: string,
  fields: Record<string, string>,
): Promise<Result<unknown, ApiError>> => {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
    const body: unknown = await response.json().catch(() => undefined);
    return response.ok
      ? ok(body)
      : err({
          kind: "http",
          status: response.status,
          message: errorMessage(body),
        });
  } catch (cause) {
    return err({ kind: "network", cause });
  }
};

export const exchangeCode = async (params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<Result<TokenResponse, ApiError>> => {
  const result = await postForm("/oauth/token", {
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  });
  if (!result.ok) return result;
  // A 200 without access_token must not become a stored undefined token.
  const token = parseTokenResponse(result.value);
  return token !== undefined
    ? ok(token)
    : err({ kind: "http", status: 200, message: "malformed token response" });
};

export const revokeToken = async (params: {
  clientId: string;
  clientSecret: string;
  token: string;
}): Promise<Result<void, ApiError>> => {
  const result = await postForm("/oauth/revoke", {
    client_id: params.clientId,
    client_secret: params.clientSecret,
    token: params.token,
  });
  return result.ok ? ok(undefined) : result;
};
