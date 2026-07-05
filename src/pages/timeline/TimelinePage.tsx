import { createAsync, revalidate } from "@solidjs/router";
import { For, Show } from "solid-js";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { getHomeTimeline } from "./queries";

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
        <p>Sign-in required to view this timeline.</p>
      ) : (
        <p>
          Request failed ({props.error.status}
          {props.error.message ? `: ${props.error.message}` : ""}).
        </p>
      );
    case "network":
      return (
        <p>
          Connection failed — check your network.{" "}
          <button type="button" onClick={() => revalidate(getHomeTimeline.key)}>
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
          <For each={r.value}>{(status) => <StatusCard status={status} />}</For>
        ) : (
          <TimelineError error={r.error} />
        );
      }}
    </Show>
  );
};
