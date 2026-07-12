import createClient from "openapi-fetch";
import { err, ok, type Result } from "./result";
import type { paths } from "./schema";
import { loadToken } from "./token-store";

// API failures are values, not exceptions (ADR-0008). Callers pattern-match
// on `kind`; 401 surfaces as http(401) and is the UI's business to render.
export type ApiError =
  | { kind: "network"; cause: unknown }
  | { kind: "http"; status: number; message?: string };

// Akkoma error bodies are `{ "error": string }`; anything else degrades to
// an undefined message rather than failing.
export const errorMessage = (body: unknown): string | undefined =>
  typeof body === "object" &&
  body !== null &&
  "error" in body &&
  typeof body.error === "string"
    ? body.error
    : undefined;

// Same-origin by design: the instance serves this frontend itself, and the
// dev proxy replays the same shape locally.
export const client = createClient<paths>({ baseUrl: "/" });

// Auth header injection is centralized here and nowhere else — divergence
// is a bug, not duplication (CLAUDE.md). Reads the store on every request
// so a login/logout in this tab takes effect without re-creating the client.
client.use({
  onRequest({ request }) {
    const token = loadToken();
    if (token !== undefined) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
});

// Folds openapi-fetch's calling convention into a Result: HTTP errors come
// back as values ({ error, response }), network-level failures as thrown
// exceptions. This is the only place either shape is allowed to appear.
export const toResult = async <T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T, ApiError>> => {
  try {
    const { data, error, response } = await call;
    return data !== undefined
      ? ok(data)
      : err({
          kind: "http",
          status: response.status,
          message: errorMessage(error),
        });
  } catch (cause) {
    return err({ kind: "network", cause });
  }
};
