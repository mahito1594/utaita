import { For, onMount, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { createTimelineStore } from "./timeline-store";

const errorBox = css({
  bg: "error.subtle",
  color: "error.default",
  borderWidth: "1px",
  borderColor: "error.default",
  borderRadius: "lg",
  p: "3",
  fontSize: "sm",
});

// Errors are ordinary render branches, not exceptions (ADR-0008): a 401 is
// the timeline's normal answer until auth exists, and a network failure is
// everyday weather on mobile. This is the full-page rendering for the
// initial load only — the store still has no content to fall back to.
const TimelineError = (props: { error: ApiError; onRetry: () => void }) => {
  // Non-reactive switch on purpose: the page's <Show> recreates this
  // component whenever the fetch result changes.
  switch (props.error.kind) {
    case "http":
      // Akkoma's unauthenticated answer differs per endpoint: home responds
      // 403 "Invalid credentials.", public responds 401 — both mean "no
      // valid user", so both get the sign-in prompt.
      return props.error.status === 401 || props.error.status === 403 ? (
        <p class={errorBox} role="alert">
          Sign-in required to view this timeline.
        </p>
      ) : (
        <p class={errorBox} role="alert">
          Request failed ({props.error.status}
          {props.error.message ? `: ${props.error.message}` : ""}).
        </p>
      );
    case "network":
      return (
        <p class={errorBox} role="alert">
          Connection failed — check your network.{" "}
          <button
            type="button"
            class={css({
              px: "3",
              py: "1",
              fontSize: "sm",
              borderWidth: "1px",
              borderColor: "error.default",
              borderRadius: "md",
              bg: "bg.surface",
              cursor: "pointer",
              _hover: { bg: "bg.subtle" },
            })}
            onClick={props.onRetry}
          >
            Retry
          </button>
        </p>
      );
  }
};

// A forward-fetch failure while the store already holds content (a refresh
// gone wrong) must not blank the timeline out from under the reader — it
// surfaces as a small notice above the existing cards instead.
const RefreshError = (props: { error: ApiError }) => (
  <p
    role="alert"
    class={css({
      bg: "error.subtle",
      color: "error.default",
      borderRadius: "md",
      p: "2",
      fontSize: "sm",
    })}
  >
    {props.error.kind === "network"
      ? "Refresh failed — check your network."
      : `Refresh failed (${props.error.status}).`}
  </p>
);

// Sticky strip at the top of the column; today it only carries the manual
// refresh control, right-aligned, but is the future home of the timeline
// switcher tabs too (docs/design/timeline-refresh-20260719.html, decision
// B) — kept as its own row rather than folded into the refresh button.
const controlStrip = css({
  position: "sticky",
  top: "0",
  // Cards' internals (MediaGrid, PollView) use position: relative/absolute
  // and would otherwise paint over this sticky strip during scroll — no
  // z-index token exists in the theme (semantic tokens cover colors, not
  // stacking), so a plain value is the right call here.
  zIndex: "1",
  display: "flex",
  justifyContent: "flex-end",
  bg: "bg.canvas",
  py: "2",
});

const refreshButton = css({
  px: "3",
  py: "1",
  fontSize: "sm",
  borderWidth: "1px",
  borderColor: "border.default",
  borderRadius: "md",
  bg: "bg.surface",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { color: "text.muted", cursor: "default" },
});

export const TimelinePage = () => {
  const store = createTimelineStore();
  onMount(() => {
    void store.refresh();
  });

  // Segment boundaries (gaps) get their own marker row in Unit 3; for now
  // the store's segments render as one continuous, newest-first list.
  const statuses = () =>
    store.segments().flatMap((segment) => segment.statuses);

  return (
    <div class={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <div class={controlStrip}>
        <button
          type="button"
          disabled={store.loading()}
          onClick={() => void store.refresh()}
          class={refreshButton}
        >
          {store.loading() ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <Show when={statuses().length === 0 && store.loading()}>
        <p role="status" class={css({ color: "text.muted" })}>
          Loading…
        </p>
      </Show>

      <Show when={statuses().length === 0 && store.error()}>
        {(error) => (
          <TimelineError error={error()} onRetry={() => void store.refresh()} />
        )}
      </Show>

      <Show when={statuses().length > 0 && store.error()}>
        {(error) => <RefreshError error={error()} />}
      </Show>

      <For each={statuses()}>{(status) => <StatusCard status={status} />}</For>
    </div>
  );
};
