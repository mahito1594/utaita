// Return leg of the OAuth round-trip. Lives in app/, not pages/, although it
// has a URL: it draws no content of its own, and the route table mounts it as
// a sibling of everything so the gate can never swallow it (App.tsx).
import { useLocation, useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { css } from "../../styled-system/css";
import { parseCallbackParams } from "../entities/session/oauth";
import {
  authenticated,
  cancelSignIn,
  completeLogin,
  type SessionError,
  signInPending,
  takeReturnPath,
} from "../entities/session/session";
import { GateFrame, LoginScreen } from "./LoginScreen";

export const OAuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = createSignal<SessionError>();

  onMount(async () => {
    const params = parseCallbackParams(location.search);
    // A sign-in this tab started outranks a stored token, which may be the
    // expired one being replaced — a 401 never clears it (ADR-0015). Its
    // refusal is reported too, not swallowed by that token.
    const returning = params.kind !== "invalid" && signInPending();
    // Any other signed-in arrival (history, a bookmark, a sign-in finished in
    // another tab) has nothing to exchange; land, on this tab's own saved path.
    if (!returning && authenticated()) {
      navigate(takeReturnPath(), { replace: true });
      return;
    }
    if (params.kind !== "code") {
      if (params.kind === "denied") cancelSignIn();
      setError({
        kind: "flow",
        message:
          params.kind === "denied"
            ? `authorization refused (${params.error})`
            : "missing authorization code",
      });
      return;
    }
    const result = await completeLogin(params.code, params.state);
    if (result.ok) {
      // Safe to land on a route whose preload already ran while signed out:
      // completeLogin flushes the query cache, so a 401/403 it recorded is
      // gone and the destination fetches again with the token.
      navigate(takeReturnPath(), { replace: true });
    } else {
      setError(result.error);
    }
  });

  return (
    <Show
      when={error()}
      fallback={
        <GateFrame>
          <p role="status" class={css({ fontSize: "sm", color: "text.muted" })}>
            Signing in…
          </p>
        </GateFrame>
      }
    >
      {(e) => <LoginScreen initialError={e()} />}
    </Show>
  );
};
