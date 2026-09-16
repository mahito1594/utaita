// The gate screen (login-20260712 wireframe): one layout, four states —
// idle, busy outbound (redirecting to authorize), busy return leg (rendered
// by OAuthCallback via GateFrame), and error. It is a state, not a place:
// no /login route exists, the AuthGate renders this at whatever URL the
// user opened (App.tsx).
import type { ParentProps } from "solid-js";
import { css } from "../../styled-system/css";
import { SignInButton } from "../entities/session/SignInButton";
import type { SessionError } from "../entities/session/session";

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

export const LoginScreen = (props: { initialError?: SessionError }) => (
  <GateFrame>
    <SignInButton prominent initialError={props.initialError} />
  </GateFrame>
);
