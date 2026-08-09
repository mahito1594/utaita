import {
  A,
  createAsync,
  revalidate,
  useIsRouting,
  useNavigate,
  useParams,
} from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { outlineButton } from "../../ui/outline-button";
import { type ThreadArrival, threadQuery } from "./thread-query";
import { buildThread, type ThreadRow } from "./thread-tree";

const errorBox = css({
  bg: "error.subtle",
  color: "error.default",
  borderWidth: "1px",
  borderColor: "error.default",
  borderRadius: "lg",
  p: "3",
  fontSize: "sm",
});

const httpMessage = (status: number, message: string | undefined): string => {
  // Akkoma answers an unauthenticated request with either code depending on
  // the endpoint, so both mean "no valid user" (TimelinePage.tsx).
  if (status === 401 || status === 403) {
    return "Sign-in required to view this conversation.";
  }
  if (status === 404) return "This post is not on this instance.";
  return `Request failed (${status}${message ? `: ${message}` : ""}).`;
};

// Errors are ordinary render branches, not exceptions (ADR-0008). The
// non-reactive switch is sound only because the page's <Show keyed> recreates
// this component whenever the error value changes.
const ThreadError = (props: { error: ApiError; onRetry: () => void }) => {
  switch (props.error.kind) {
    case "http":
      return (
        <p class={errorBox} role="alert">
          {httpMessage(props.error.status, props.error.message)}
        </p>
      );
    case "network":
      return (
        <p class={errorBox} role="alert">
          Connection failed — check your network.{" "}
          <button
            type="button"
            class={outlineButton({ tone: "error" })}
            onClick={props.onRetry}
          >
            Retry
          </button>
        </p>
      );
  }
};

const note = css({ fontSize: "xs", color: "text.muted" });

const list = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  listStyleType: "none",
});

// One rule at one offset for every row, whatever its depth. Nesting the
// indentation instead would spend the width a phone does not have, and a deep
// branch would end up narrower than a shallow one for no reader benefit; who a
// post answers is carried by its own "replying to" line (StatusCard.tsx).
const rowShape = {
  borderLeftWidth: "2px",
  pl: "3",
  display: "flex",
  flexDirection: "column",
  gap: "1",
} as const;

const rowStyle = css({ ...rowShape, py: "1", borderColor: "border.default" });

// The post the reader opened, marked in two channels at once: the rule turns
// accent and the row takes the page tone behind a card that stays white.
const subjectRowStyle = css({
  ...rowShape,
  py: "2",
  borderColor: "accent.default",
  bg: "bg.subtle",
  borderTopRightRadius: "lg",
  borderBottomRightRadius: "lg",
});

const ThreadRowItem = (props: {
  row: ThreadRow;
  onSubjectRef: (element: HTMLElement) => void;
}) => (
  <li
    class={props.row.place === "subject" ? subjectRowStyle : rowStyle}
    aria-current={props.row.place === "subject" ? "true" : undefined}
    ref={(element) => {
      if (props.row.place === "subject") props.onSubjectRef(element);
    }}
  >
    {/* The card's own "replying to @who" line would claim the parent is on
        hand; this says otherwise while there is nothing to open. */}
    <Show when={props.row.replyTo.kind === "unfetched"}>
      <p class={note}>
        This instance has not fetched the post this replies to.
      </p>
    </Show>
    <StatusCard status={props.row.status} />
  </li>
);

/**
 * The conversation around one status, as a flat list: ancestors above the post
 * the reader opened, its replies below, depth-first (thread-tree.ts).
 *
 * `data` is what the route's preload read off the navigation itself
 * (thread-query.ts) — this page cannot work it out on its own, and both of the
 * things it decides are about not fighting the router over the scroll offset.
 */
export const ThreadPage = (props: { data: ThreadArrival }) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isRouting = useIsRouting();
  const thread = createAsync(() => threadQuery(params.id));

  const rows = createMemo<readonly ThreadRow[]>(() => {
    const result = thread();
    return result === undefined || !result.ok
      ? []
      : buildThread(result.value.subject, result.value.context);
  });
  const error = () => {
    const result = thread();
    return result === undefined || result.ok ? undefined : result.error;
  };

  const connected = () => rows().filter((row) => row.place !== "detached");
  const detached = () => rows().filter((row) => row.place === "detached");

  const [subjectElement, setSubjectElement] = createSignal<HTMLElement>();
  let landed = false;

  // Scrolling the subject into view waits for the router to finish its own
  // scrolling, which happens once routing settles: a push ends at the top of
  // the document, and there is no offset to hold before the ancestors above
  // the subject have rendered at their real height. On a traversal this does
  // not run at all — see `landOnSubject` (thread-query.ts).
  createEffect(() => {
    if (!props.data.landOnSubject || landed) return;
    const element = subjectElement();
    if (element === undefined || isRouting()) return;
    landed = true;
    element.scrollIntoView();
  });

  return (
    <section>
      <div
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          mb: "3",
        })}
      >
        {/* History back, not a link to the timeline: scroll restoration only
            applies to traversals, so a link would drop the reading position
            the excursion was supposed to keep (ADR-0004 amendment). A page
            opened straight from a link has no such entry behind it. */}
        <Show
          when={props.data.canGoBack}
          fallback={
            <A href="/" class={outlineButton({ tone: "neutral" })}>
              Home
            </A>
          }
        >
          <button
            type="button"
            class={outlineButton({ tone: "neutral" })}
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        </Show>
        <h2 class={css({ fontSize: "md", fontWeight: "semibold" })}>
          Conversation
        </h2>
      </div>

      <Show when={error()} keyed>
        {(failure) => (
          <ThreadError
            error={failure}
            onRetry={() => void revalidate(threadQuery.keyFor(params.id))}
          />
        )}
      </Show>

      <ol class={list}>
        <For each={connected()}>
          {(row) => (
            <ThreadRowItem row={row} onSubjectRef={setSubjectElement} />
          )}
        </For>
      </ol>

      {/* Posts the context delivered that no chain of replies ties to the
          subject — federation loses middle posts, and dropping them would take
          whole branches out of the view without a trace (thread-tree.ts). */}
      <Show when={detached().length > 0}>
        <section class={css({ mt: "4" })}>
          <h3 class={css({ fontSize: "sm", fontWeight: "semibold" })}>
            Not connected to this post
          </h3>
          <p class={css({ fontSize: "xs", color: "text.muted", mb: "2" })}>
            These came with the conversation, but the posts that would link them
            to it are missing.
          </p>
          <ol class={list}>
            <For each={detached()}>
              {(row) => (
                <ThreadRowItem row={row} onSubjectRef={setSubjectElement} />
              )}
            </For>
          </ol>
        </section>
      </Show>
    </section>
  );
};
