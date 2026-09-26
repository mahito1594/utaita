import { HttpResponse, http } from "msw";
import type { SetupServer } from "msw/node";
import { expect, onTestFinished } from "vitest";
import { completeLogin, logout } from "../entities/session/session";

/**
 * Renders the rest of the test signed in. The session signal is module-level
 * and only the sign-in flow sets it, so an authenticated render has to come
 * through completeLogin (entities/session/session.ts) rather than through a
 * token written straight to storage.
 */
export const signIn = async (server: SetupServer): Promise<void> => {
  localStorage.setItem("utaita:client_id", "cid-1");
  localStorage.setItem("utaita:client_secret", "sec-1");
  sessionStorage.setItem("utaita:oauth_state", "nonce-1");
  server.use(
    http.post("*/oauth/token", () =>
      HttpResponse.json({ access_token: "tok-1", token_type: "Bearer" }),
    ),
  );
  onTestFinished(async () => {
    // Storage first: with no credentials left, logout() drops the signal
    // without attempting a revoke this suite has no handler for.
    localStorage.clear();
    sessionStorage.clear();
    await logout();
  });
  expect((await completeLogin("code-1", "nonce-1")).ok).toBe(true);
};
