// The one way into the session, wherever it is offered: the gate screen, the
// header, and the error branches of the pages that can be read without a
// session (ThreadPage.tsx, ProfilePage.tsx). It owns the whole interaction —
// login() either navigates away to the instance's authorize page, in which
// case the button stays busy until the document is replaced, or comes back
// with a failure that belongs next to the button that caused it.
//
// Every element here is phrasing content: two of the call sites render it
// inside the `<p role="alert">` their failure is already written in.
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { css, cx } from "../../../styled-system/css";
import { outlineButton } from "../../ui/outline-button";
import { login, type SessionError } from "./session";

const errorBox = css({
  display: "inline-block",
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

// Beside the button by default — it is one control among a line of others.
const inlineLayout = css({
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2",
});

// On the gate screen the button is the screen's whole subject, so it takes
// the hero shape and the message stacks above it (login-20260712 wireframe).
const stackedLayout = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4",
});

const heroButton = css({
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
});

export const SignInButton = (props: {
  /** The gate screen's hero treatment, rather than one control among many. */
  prominent?: boolean;
  /** A failure the flow arrived with, from the callback's hand-off. */
  initialError?: SessionError | undefined;
}) => {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal(props.initialError);

  // bfcache guard: "Back" from the authorize page can thaw this button with
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
  // setError and the message can take focus itself.
  let errorEl: HTMLSpanElement | undefined;

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
    <span class={props.prominent ? stackedLayout : inlineLayout}>
      <Show when={error()}>
        {(e) => (
          <span class={errorBox} role="alert" tabindex="-1" ref={errorEl}>
            {errorText(e())}
          </span>
        )}
      </Show>
      <button
        type="button"
        disabled={busy()}
        onClick={() => void handleLogin()}
        // Its own colour, not the surrounding text's: two call sites render
        // it inside an error box, where inheriting would make a neutral
        // control look like part of the failure.
        class={
          props.prominent
            ? heroButton
            : cx(
                outlineButton({ tone: "neutral" }),
                css({ color: "text.default" }),
              )
        }
      >
        Log in
      </button>
      <Show when={busy()}>
        <span
          role="status"
          class={css({ fontSize: "sm", color: "text.muted" })}
        >
          Redirecting…
        </span>
      </Show>
    </span>
  );
};
