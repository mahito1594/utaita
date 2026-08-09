// Return leg of the OAuth round-trip. Lives in app/, not pages/, although
// it has a URL: it is session machinery, and a page could not import the
// session shell without violating the dependency rule (nothing imports
// app — ADR-0010 amendment).
import { useLocation, useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { css } from "../../styled-system/css";
import { GateFrame, LoginScreen } from "./LoginScreen";
import { parseCallbackParams } from "./oauth";
import {
  authenticated,
  completeLogin,
  type SessionError,
  takeReturnPath,
} from "./session";

export const OAuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = createSignal<SessionError>();

  onMount(async () => {
    // Revisits from history or a bookmark while signed in have nothing to
    // exchange (the nonce is long consumed); land instead of erroring. The
    // destination is still taken here rather than assumed to be home: the
    // token is shared across tabs, so this tab can come back from authorize
    // already signed in by another one, with its own deep link still saved.
    if (authenticated()) {
      navigate(takeReturnPath(), { replace: true });
      return;
    }
    const params = parseCallbackParams(location.search);
    if (params.kind !== "code") {
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
