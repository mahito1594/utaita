// The gate screen (login-20260712 wireframe): one layout, four states —
// idle, busy outbound (redirecting to authorize), busy return leg (rendered
// by OAuthCallback via GateFrame), and error. It is a state, not a place:
// no /login route exists, the AuthGate renders this at whatever URL the
// user opened.
import {
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  Show,
} from "solid-js";
import { css } from "../../styled-system/css";
import { login, type SessionError } from "./session";

// Shared frame for the login screen and the callback's busy state. The app
// name itself already sits in the Layout header; here only the instance
// host identifies where the user is signing in (wireframe decision: no
// /api/v1/instance fetch before login).
export const GateFrame = (props: ParentProps) => (
  <div
    class={css({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4",
      py: "16",
      textAlign: "center",
    })}
  >
    <p class={css({ fontSize: "sm", color: "text.muted" })}>
      {window.location.host}
    </p>
    {props.children}
  </div>
);

const errorBox = css({
  bg: "error.subtle",
  color: "error.default",
  borderWidth: "1px",
  borderColor: "error.default",
  borderRadius: "lg",
  p: "3",
  fontSize: "sm",
});

// Registration failures, authorize denial, and code-exchange failures all
// converge on the same inline message + the button as retry (wireframe).
const errorText = (error: SessionError): string => {
  switch (error.kind) {
    case "http":
      return `Login failed (${error.status}${error.message ? `: ${error.message}` : ""}).`;
    case "network":
      return "Connection failed — check your network.";
    case "flow":
      return `Login failed: ${error.message}.`;
  }
};

export const LoginScreen = (props: { initialError?: SessionError }) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal(props.initialError);

  // bfcache guard: "Back" from the authorize page can thaw this screen with
  // busy still true (the whole JS heap is frozen and restored, no remount);
  // pageshow with `persisted` is the only signal that this happened.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) setBusy(false);
  };
  window.addEventListener("pageshow", onPageShow);
  onCleanup(() => window.removeEventListener("pageshow", onPageShow));

  // Clicking sets `disabled` on the still-focused button, which blurs it
  // (HTML focus rules) — without an explicit landing spot a keyboard or
  // screen-reader user is left on <body> with no announcement when the
  // flow fails. Solid renders synchronously, so the ref is set right after
  // setError and the error box can take focus itself.
  let errorEl: HTMLParagraphElement | undefined;

  onMount(() => {
    // Mounted already showing an error (the callback's failure hand-off).
    if (error() !== undefined) errorEl?.focus();
  });

  const handleLogin = async () => {
    setBusy(true);
    setError(undefined);
    const result = await login();
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      errorEl?.focus();
    }
    // Ok means the browser is navigating to the authorize page — stay busy.
  };

  return (
    <GateFrame>
      <Show when={error()}>
        {(e) => (
          <p class={errorBox} role="alert" tabindex="-1" ref={errorEl}>
            {errorText(e())}
          </p>
        )}
      </Show>
      <button
        type="button"
        disabled={busy()}
        onClick={() => void handleLogin()}
        class={css({
          px: "6",
          py: "2",
          fontSize: "md",
          fontWeight: "semibold",
          color: "accent.default",
          borderWidth: "1px",
          borderColor: "accent.default",
          borderRadius: "md",
          bg: "bg.surface",
          cursor: "pointer",
          _hover: { bg: "bg.subtle" },
          _disabled: { color: "text.muted", borderColor: "border.default" },
        })}
      >
        Log in
      </button>
      <Show when={busy()}>
        <p role="status" class={css({ fontSize: "sm", color: "text.muted" })}>
          Redirecting…
        </p>
      </Show>
    </GateFrame>
  );
};
