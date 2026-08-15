import {
  A,
  createAsync,
  revalidate,
  useIsRouting,
  useNavigate,
  useParams,
} from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import type { Result } from "../../api/result";
import { takeThreadRequest } from "../../entities/status/open-thread";
import { StatusCard } from "../../entities/status/StatusCard";
import type { Status } from "../../entities/status/types";
import { outlineButton } from "../../ui/outline-button";
import { resolveStatus } from "./thread-api";
import { type Thread, type ThreadArrival, threadQuery } from "./thread-query";
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

// The plane the conversation is drawn on, built exactly like the timeline's
// panel (TimelineShell.tsx) — full-bleed on mobile by escaping `main`'s px-4
// (App.tsx), bordered and rounded from `md` up, where "the panel is capped"
// and "the column is capped" are the same condition by construction. Sharing
// the construction is the point: a de-carded row needs a surface under it, and
// anything else would flip the background on every timeline ⇄ thread round
// trip (docs/design/timeline-density.md).
const planeShape = {
  bg: "bg.surface",
  mx: "-4",
  md: {
    mx: "0",
    borderWidth: "1px",
    borderColor: "border.default",
    borderRadius: "md",
  },
} as const;

// Body of a plane: no padding and no gap of its own, so the rules the rows
// draw span it and the rows carry the inset (TimelineShell's `panelBody`).
const rowColumn = {
  display: "flex",
  flexDirection: "column",
  listStyleType: "none",
} as const;

// The connected conversation: one plane whose whole content is rows.
const list = css({ ...rowColumn, ...planeShape });

// The detached posts get a plane of their own, headed by a band rather than
// starting straight at a row: standing on the canvas above the plane, the
// heading read as a caption for the page instead of for the rows it names.
const detachedPlane = css({ ...planeShape, mt: "4" });
const detachedRows = css(rowColumn);

// The plane's top edge, built like the timeline bar's (TimelineShell.tsx) —
// same inset as the rows below it, same top radius standing in for the clip
// the plane must not do — but not sticky: it heads a section of a page that
// scrolls past, not a panel the reader keeps working in.
const detachedBand = css({
  px: "3",
  py: "2",
  borderBottomWidth: "1px",
  borderBottomColor: "border.default",
  md: { borderTopRadius: "md" },
});

// A refetch that failed while the conversation is on screen: the rows stay and
// the failure sits above them, mirroring the timeline's RefreshError.
const refreshNotice = css({
  bg: "error.subtle",
  color: "error.default",
  borderRadius: "md",
  p: "2",
  mb: "2",
  fontSize: "sm",
  // Anchoring to a row that vanishes on retry would slide the viewport
  // (TimelinePage.tsx).
  overflowAnchor: "none",
});

const RefreshNotice = (props: { error: ApiError; onRetry: () => void }) => (
  <p role="alert" class={refreshNotice}>
    {props.error.kind === "network"
      ? "Refresh failed — check your network."
      : `Refresh failed (${props.error.status}).`}{" "}
    <button
      type="button"
      class={outlineButton({ tone: "error" })}
      onClick={props.onRetry}
    >
      Retry
    </button>
  </p>
);

// One rule at one offset for every row, whatever its depth. Nesting the
// indentation instead would spend the width a phone does not have, and a deep
// branch would end up narrower than a shallow one for no reader benefit; who a
// post answers is carried by its own "replying to" line (StatusCard.tsx).
//
// The row reaches both edges of the plane and insets its body by 12px on each
// side, with the spine spending part of the left gutter rather than pushing
// the text inward (docs/design/timeline-density.md). The closing hairline and
// the 12px block padding are the timeline row's (TimelinePage.tsx), so the two
// views scroll at one rhythm.
//
// What the row itself draws is the spine, the plane and the rule; the inset is
// `rowBody`'s, on the content the row holds.
const rowShape = {
  display: "flex",
  flexDirection: "column",
  gap: "1",
  borderLeftWidth: "2px",
  borderBottomWidth: "1px",
  borderBottomColor: "border.default",
  // Nothing follows the last row inside the plane, so its rule would either
  // sit on the panel's own bottom border or dangle across the mobile
  // full-bleed edge.
  _last: { borderBottomWidth: "0" },
  md: {
    // Neither plane clips its content (TimelineShell.tsx), so the rows at the
    // ends round their own corners the way the timeline's bar does — a square
    // spine, or the subject's square background, would otherwise cut across
    // the panel's rounded corners.
    _first: { borderTopRadius: "md" },
    _last: { borderBottomRadius: "md" },
  },
} as const;

const rowStyle = css({ ...rowShape, borderLeftColor: "border.default" });

// The post the reader opened, marked in two channels at once: the spine turns
// accent and the row takes the page tone out of the plane the others sit on.
// The band runs edge to edge like every other row — a rounded right end would
// read as the row pulling away from the plane it belongs to.
const subjectRowStyle = css({
  ...rowShape,
  borderLeftColor: "accent.default",
  bg: "bg.subtle",
});

// A row on the detached plane, whose top edge is the heading band rather than
// a row: the first one has the band's bottom rule over it, so rounding its
// spine there would notch a corner in the middle of the plane. The whole `md`
// block is restated rather than deleted from a copy — the bottom of the plane
// is still a row's to round.
const detachedRowStyle = css({
  ...rowShape,
  borderLeftColor: "border.default",
  md: { _last: { borderBottomRadius: "md" } },
});

// 12px from each edge of the row, the spine counted in on the left.
const rowInset = { pl: "2.5", pr: "3" } as const;

// The card carries the whole inset, block padding included: a tap anywhere on
// a post opens it (StatusCard.tsx), and padding held by the row around the
// card would be a band the thumb can miss the post in.
const rowBody = css({ ...rowInset, py: "3" });

// Under a placeholder, which opens the row itself: the card only closes it,
// and the 4px between the two stays the row's own gap. The placeholder is not
// part of what a tap on the post reaches — it has its own controls.
const rowBodyUnderPlaceholder = css({ ...rowInset, pb: "3" });
const placeholderStyle = css({ ...rowInset, pt: "3" });

const ThreadRowItem = (props: {
  row: ThreadRow;
  // Every row reports its element; which of them the page keeps is the page's
  // business (it holds a scroll on one and hands focus to another).
  onRef: (element: HTMLElement) => void;
  onFetchParent: (apId: string) => Promise<Result<Status | null, ApiError>>;
}) => {
  const placeholder = () =>
    props.row.replyTo.kind === "unfetched" ? props.row.replyTo : undefined;

  const rowClass = () => {
    switch (props.row.place) {
      case "subject":
        return subjectRowStyle;
      case "detached":
        return detachedRowStyle;
      default:
        return rowStyle;
    }
  };

  return (
    <li
      class={rowClass()}
      aria-current={props.row.place === "subject" ? "true" : undefined}
      // The landing spot for a keyboard or screen-reader arrival (the page's
      // landing effect focuses it); LoginScreen.tsx sets the pattern.
      tabindex={props.row.place === "subject" ? "-1" : undefined}
      ref={(element) => props.onRef(element)}
    >
      <Show when={placeholder()}>
        {(target) => (
          <div class={placeholderStyle}>
            <UnfetchedParent
              apId={target().apId}
              onFetch={props.onFetchParent}
            />
          </div>
        )}
      </Show>
      <StatusCard
        status={props.row.status}
        // A conversation is read as an exchange, where the posts can sit
        // minutes apart: "2d" on every row would say nothing about the
        // spacing the timeline's relative age is enough for.
        timeStyle="precise"
        class={placeholder() === undefined ? rowBody : rowBodyUnderPlaceholder}
      />
    </li>
  );
};

// 40px ghost icon button, the shape the timeline bar's refresh control uses
// (TimelineShell.tsx). The label the reader reads is the arrow, so the
// accessible name is carried by `aria-label` and the icon is hidden from it.
const backButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "10",
  height: "10",
  borderRadius: "md",
  bg: "transparent",
  color: "accent.default",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
});

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
  // `createAsync` keeps answering with the previous post's value while a new
  // `:id` loads, so the id travels with the answer: pairing it with the
  // current one files a conversation under another's URL. Both statements
  // stay ahead of the first await — `query` registers against the calling
  // listener, which an await would lose, and with it `revalidate`'s hold.
  const thread = createAsync(async () => {
    const id = params.id;
    return { id, result: await threadQuery(id) };
  });
  const answer = (): Result<Thread, ApiError> | undefined => {
    const current = thread();
    return current === undefined || current.id !== params.id
      ? undefined
      : current.result;
  };

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
  // standing above it unless it is back on the post the page opened with —
  // where it stands on the described entry again, so `data`'s answer holds.
  const canGoBack = () => {
    const current = arrival();
    if (current === opening) return props.data.canGoBack;
    if (current.requested || current.id !== opening.id) return true;
    return props.data.canGoBack;
  };

  // A refetch that settles err must not blank the conversation out from under
  // the reader (the timeline holds the same line, ADR-0004 amendment) — the
  // last ok Thread is kept, keyed by `:id` so it never outlives its URL.
  const loaded = createMemo<{ id: string; thread: Thread } | undefined>(
    (held) => {
      const id = params.id;
      const result = answer();
      const kept = held !== undefined && held.id === id ? held : undefined;
      return result === undefined || !result.ok
        ? kept
        : { id, thread: result.value };
    },
  );
  const rows = createMemo<readonly ThreadRow[]>(() => {
    const current = loaded();
    return current === undefined
      ? []
      : buildThread(current.thread.subject, current.thread.context);
  });
  const error = () => {
    const result = answer();
    return result === undefined || result.ok ? undefined : result.error;
  };
  const retry = () => void revalidate(threadQuery.keyFor(params.id));

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
    if (element === undefined || !element.isConnected || isRouting()) return;
    landed = current;
    // Keyboard and screen-reader arrivals land where sighted ones look: the
    // subject row takes focus, with the scroll left to scrollIntoView.
    element.focus({ preventScroll: true });
    element.scrollIntoView();
  });

  // Where the subject sat in the viewport just before a rebuild that will grow
  // the thread above it; undefined whenever no such rebuild is coming. Carries
  // the thread's id so a hold taken in one thread never shifts another.
  let heldSubjectTop: { readonly id: string; readonly top: number } | undefined;

  // The post an ingest pulled in, waiting for the rebuild to give it a row to
  // hand focus to; the same one-slot, id-carrying shape as the scroll hold.
  let pendingParentFocus:
    | { readonly id: string; readonly statusId: string }
    | undefined;

  // The element that row turned out to be. A signal, because the rebuild that
  // produces it is what the effect handing over focus is waiting for.
  const [parentFocusRow, setParentFocusRow] = createSignal<{
    readonly statusId: string;
    readonly element: HTMLElement;
  }>();

  // Both halves go together: the element outlives the rows around it as long as
  // the signal names it, and a row kept past its rebuild is a detached subtree.
  const disarmParentFocus = (): void => {
    pendingParentFocus = undefined;
    setParentFocusRow(undefined);
  };

  const noteRow = (row: ThreadRow, element: HTMLElement): void => {
    if (row.place === "subject") setSubjectElement(element);
    const statusId = row.status.id;
    if (statusId !== undefined && statusId === pendingParentFocus?.statusId) {
      setParentFocusRow({ statusId, element });
    }
  };

  /**
   * Pulls a reply's missing parent onto the instance and rebuilds the thread
   * around it. Reloading the whole conversation is what makes the parent
   * appear: the reply's own `in_reply_to_id` stops being the unfetched
   * sentinel only in a freshly fetched copy (thread-query.ts).
   */
  const fetchParent = async (
    apId: string,
  ): Promise<Result<Status | null, ApiError>> => {
    // Captured before the awaits: `:id` can move while the resolve runs, and a
    // slow fetch must not revalidate whichever thread the reader moved on to.
    const threadId = params.id;
    const result = await resolveStatus(apId);
    if (!result.ok || result.value === null) return result;
    // Measured here rather than when the button was pressed: the fetch takes
    // seconds, and any scrolling the reader did while waiting is theirs to
    // keep. Only the rebuild that follows has to be compensated for.
    if (params.id === threadId) {
      const top = subjectElement()?.getBoundingClientRect().top;
      heldSubjectTop = top === undefined ? undefined : { id: threadId, top };
      const statusId = result.value.id;
      pendingParentFocus =
        statusId === undefined ? undefined : { id: threadId, statusId };
    }
    await revalidate(threadQuery.keyFor(threadId));
    return result;
  };

  // Keeps the reader looking at the same post when an ancestor is inserted
  // above it. The browser's own scroll anchoring cannot do this: every row is
  // rebuilt from a new object on a reload, so `<For>`'s reference keying
  // replaces the entire list and leaves no anchor candidate standing.
  createEffect(() => {
    rows();
    // A reload that settles err rebuilds nothing, so `rows()` alone would leave
    // the hold armed for a later rebuild the reader has since scrolled away
    // from.
    const failed = error() !== undefined;
    const held = heldSubjectTop;
    if (held === undefined) return;
    if (failed || held.id !== params.id) {
      heldSubjectTop = undefined;
      return;
    }
    const element = subjectElement();
    if (element === undefined || !element.isConnected) return;
    heldSubjectTop = undefined;
    const shift = element.getBoundingClientRect().top - held.top;
    if (shift !== 0) window.scrollBy(0, shift);
  });

  // Hands focus to the post the reader asked for. The button that asked is gone
  // with the placeholder it stood in, so focus would otherwise fall to <body>
  // and leave a keyboard or screen-reader reader at the top of the document
  // with no sign that anything arrived. `preventScroll` because the two run off
  // the same rebuild and where the viewport ends up is `heldSubjectTop`'s call.
  createEffect(() => {
    rows();
    // Read before the arm is, and so subscribed to whether or not one is
    // waiting: a reload that settles err rebuilds nothing, and this run is the
    // only one that comes to drop an arm whose rebuild never arrived. Reading
    // them behind the arm would leave it standing until some later reload
    // succeeded — and hand focus to a row the reader has since scrolled away
    // from, silently, since the move does not scroll.
    const failed = error() !== undefined;
    const id = params.id;
    const pending = pendingParentFocus;
    if (pending === undefined) return;
    if (failed || pending.id !== id) {
      disarmParentFocus();
      return;
    }
    // This run is the rebuild the arm was waiting for, so it is also the arm's
    // last chance: a reload that settled without the post — Akkoma can take a
    // beat to link the reply to a parent it has just ingested — leaves nothing
    // behind to consume it, and an arm left standing would fire on whatever
    // rebuild came next, silently, since the move does not scroll.
    const target = parentFocusRow();
    disarmParentFocus();
    if (target === undefined || target.statusId !== pending.statusId) return;
    if (!target.element.isConnected) return;
    // Rows are out of the tab order, so the landing spot is made focusable as
    // it is focused rather than standing ready: every row is rebuilt from a new
    // element on a reload, which is also what takes the attribute away again.
    target.element.setAttribute("tabindex", "-1");
    target.element.focus({ preventScroll: true });
    // The hold answers for the subject, not for the parent: a tall parent fills
    // the gap above the placeholder's row and overshoots the top, and a reader
    // who scrolled during the seconds the fetch took can have left the whole
    // row below the fold. Either way focus would sit where nobody can see it,
    // so the correction runs on both — and on neither when the hold did its job.
    const rect = target.element.getBoundingClientRect();
    if (rect.top < 0 || rect.top >= window.innerHeight) {
      target.element.scrollIntoView({ block: "nearest" });
    }
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
            aria-label="Back"
            class={backButton}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        </Show>
        <h2 class={css({ fontSize: "sm", fontWeight: "semibold" })}>
          Conversation
        </h2>
      </div>

      <Show when={error()} keyed>
        {(failure) => (
          <Show
            when={rows().length > 0}
            fallback={<ThreadError error={failure} onRetry={retry} />}
          >
            <RefreshNotice error={failure} onRetry={retry} />
          </Show>
        )}
      </Show>

      {/* The plane is visible in its own right — an empty one is a bare strip
          of surface, and a hairline of border on md — so it arrives with the
          first row rather than standing under the heading while the
          conversation loads or after a load that brought none. */}
      <Show when={connected().length > 0}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the implied role under list-style:none */}
        <ol class={list} role="list">
          <For each={connected()}>
            {(row) => (
              <ThreadRowItem
                row={row}
                onRef={(element) => noteRow(row, element)}
                onFetchParent={fetchParent}
              />
            )}
          </For>
        </ol>
      </Show>

      {/* Posts the context delivered that no chain of replies ties to the
          subject — federation loses middle posts, and dropping them would take
          whole branches out of the view without a trace (thread-tree.ts). */}
      <Show when={detached().length > 0}>
        <section class={detachedPlane}>
          <div class={detachedBand}>
            <h3 class={css({ fontSize: "sm", fontWeight: "semibold" })}>
              Not connected to this post
            </h3>
            <p class={css({ fontSize: "xs", color: "text.muted" })}>
              These came with the conversation, but the posts that would link
              them to it are missing.
            </p>
          </div>
          {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the implied role under list-style:none */}
          <ol class={detachedRows} role="list">
            <For each={detached()}>
              {(row) => (
                <ThreadRowItem
                  row={row}
                  onRef={(element) => noteRow(row, element)}
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
