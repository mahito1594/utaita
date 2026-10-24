import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { css } from "../../styled-system/css";
import { outlineButton } from "./outline-button";

const errorBox = css({
  bg: "error.subtle",
  color: "error.default",
  borderWidth: "1px",
  borderColor: "error.default",
  borderRadius: "lg",
  p: "3",
  m: "3",
  fontSize: "sm",
});

// Errors are ordinary render branches, not exceptions (ADR-0008). Both the
// wording and whether recovery is offered at all belong to the call site: an
// account that is not here says something different from a list that did not
// arrive, and only one of the two can be worth a second request.
export const ErrorCard = (props: {
  message: string;
  onRetry: (() => void) | undefined;
  // Further recovery beside Retry, e.g. a sign-in button gated on
  // `offersSignIn`; it lives in the caller because ui cannot reach entities.
  children?: JSX.Element;
}) => (
  <p class={errorBox} role="alert">
    {props.message}{" "}
    <Show when={props.onRetry !== undefined}>
      <button
        type="button"
        class={outlineButton({ tone: "error" })}
        onClick={props.onRetry}
      >
        Retry
      </button>
    </Show>{" "}
    {props.children}
  </p>
);
