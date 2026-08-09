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
import type { Result } from "../../api/result";
import { takeThreadRequest } from "../../entities/status/open-thread";
import { StatusCard } from "../../entities/status/StatusCard";
import type { Status } from "../../entities/status/types";
import { outlineButton } from "../../ui/outline-button";
import { resolveStatus } from "./thread-api";
import { type ThreadArrival, threadQuery } from "./thread-query";
import { buildThread, type ThreadRow } from "./thread-tree";
import { UnfetchedParent } from "./UnfetchedParent";

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
  onFetchParent: (apId: string) => Promise<Result<Status | null, ApiError>>;
}) => (
  <li
    class={props.row.place === "subject" ? subjectRowStyle : rowStyle}
    aria-current={props.row.place === "subject" ? "true" : undefined}
    ref={(element) => {
      if (props.row.place === "subject") props.onSubjectRef(element);
    }}
  >
    <Show
      when={
        props.row.replyTo.kind === "unfetched" ? props.row.replyTo : undefined
      }
    >
      {(target) => (
        <UnfetchedParent apId={target().apId} onFetch={props.onFetchParent} />
      )}
    </Show>
    <StatusCard status={props.row.status} />
  </li>
);

/**
 * The conversation around one status, as a flat list: ancestors above the post
 * the reader opened, its replies below, depth-first (thread-tree.ts).
 *
 * Opening a post from inside a conversation changes `:id` without recreating
 * this page, so nothing about the arrival may be read once and kept: `data`
 * describes the entry the page opened on and no other (thread-query.ts).
 */
export const ThreadPage = (props: { data: ThreadArrival }) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isRouting = useIsRouting();
  const thread = createAsync(() => threadQuery(params.id));

  // One value per arrival, whether the route was matched afresh or only `:id`
  // moved. Reading the request is what consumes it, so this belongs in a
  // computation that runs exactly once per id — not in an effect that reruns
  // as the thread below it is rebuilt.
  const arrival = createMemo(() => ({
    id: params.id,
    requested: takeThreadRequest(params.id),
  }));

  const opening = arrival();
  // `data` describes the entry the page opened on and no other. From there,
  // opening another post pushes an entry above that one, and a traversal is
  // standing above it unless it is back on the post the page opened with.
  // Where that reasoning is wrong it is wrong conservatively: every case
  // answered false is one where the opening entry may be the only one this app
  // put on the stack, and offering a back that leaves the app is the one
  // outcome worth ruling out.
  const canGoBack = () => {
    const current = arrival();
    if (current === opening) return props.data.canGoBack;
    return current.requested || current.id !== opening.id;
  };

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
  let landed: object | undefined;

  // Scrolling the subject into view waits for the router to finish its own
  // scrolling, which happens once routing settles: a push ends at the top of
  // the document, and there is no offset to hold before the ancestors above
  // the subject have rendered at their real height. On a traversal this does
  // not run at all — scroll restoration owns the offset there. Landing is
  // remembered per arrival rather than once, so that a rebuild mid-visit never
  // re-centres the subject while reopening the same post later still does.
  createEffect(() => {
    const current = arrival();
    if (!current.requested || landed === current) return;
    const element = subjectElement();
    if (element === undefined || isRouting()) return;
    landed = current;
    element.scrollIntoView();
  });

  // Where the subject sat in the viewport just before a rebuild that will grow
  // the thread above it; undefined whenever no such rebuild is coming.
  let heldSubjectTop: number | undefined;

  /**
   * Pulls a reply's missing parent onto the instance and rebuilds the thread
   * around it. Reloading the whole conversation is what makes the parent
   * appear: the reply's own `in_reply_to_id` stops being the unfetched
   * sentinel only in a freshly fetched copy (thread-query.ts).
   */
  const fetchParent = async (
    apId: string,
  ): Promise<Result<Status | null, ApiError>> => {
    const result = await resolveStatus(apId);
    if (!result.ok || result.value === null) return result;
    // Measured here rather than when the button was pressed: the fetch takes
    // seconds, and any scrolling the reader did while waiting is theirs to
    // keep. Only the rebuild that follows has to be compensated for.
    heldSubjectTop = subjectElement()?.getBoundingClientRect().top;
    await revalidate(threadQuery.keyFor(params.id));
    return result;
  };

  // Keeps the reader looking at the same post when an ancestor is inserted
  // above it. The browser's own scroll anchoring cannot do this: every row is
  // rebuilt from a new object on a reload, so `<For>`'s reference keying
  // replaces the entire list and leaves no anchor candidate standing.
  createEffect(() => {
    rows();
    const before = heldSubjectTop;
    if (before === undefined) return;
    const element = subjectElement();
    if (element === undefined) return;
    heldSubjectTop = undefined;
    const shift = element.getBoundingClientRect().top - before;
    if (shift !== 0) window.scrollBy(0, shift);
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
          when={canGoBack()}
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
            <ThreadRowItem
              row={row}
              onSubjectRef={setSubjectElement}
              onFetchParent={fetchParent}
            />
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
                <ThreadRowItem
                  row={row}
                  onSubjectRef={setSubjectElement}
                  onFetchParent={fetchParent}
                />
              )}
            </For>
          </ol>
        </section>
      </Show>
    </section>
  );
};
