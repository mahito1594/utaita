import { createAsync, revalidate } from "@solidjs/router";
import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { getHomeTimeline } from "./queries";

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
// everyday weather on mobile. Recovery is always `revalidate` — the Err
// stays cached until an explicit retry or an auth change refetches it.
const TimelineError = (props: { error: ApiError }) => {
  // Non-reactive switch on purpose: the page's <Show> recreates this
  // component whenever the fetch result changes.
  switch (props.error.kind) {
    case "http":
      // Akkoma's unauthenticated answer differs per endpoint: home responds
      // 403 "Invalid credentials.", public responds 401 — both mean "no
      // valid user", so both get the sign-in prompt.
      return props.error.status === 401 || props.error.status === 403 ? (
        <p class={errorBox}>Sign-in required to view this timeline.</p>
      ) : (
        <p class={errorBox}>
          Request failed ({props.error.status}
          {props.error.message ? `: ${props.error.message}` : ""}).
        </p>
      );
    case "network":
      return (
        <p class={errorBox}>
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
            onClick={() => revalidate(getHomeTimeline.key)}
          >
            Retry
          </button>
        </p>
      );
  }
};

export const TimelinePage = () => {
  const timeline = createAsync(() => getHomeTimeline());

  return (
    <Show when={timeline()}>
      {(result) => {
        const r = result();
        return r.ok ? (
          <div
            class={css({ display: "flex", flexDirection: "column", gap: "3" })}
          >
            <For each={r.value}>
              {(status) => <StatusCard status={status} />}
            </For>
          </div>
        ) : (
          <TimelineError error={r.error} />
        );
      }}
    </Show>
  );
};
