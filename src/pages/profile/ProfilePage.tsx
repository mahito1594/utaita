import { createAsync, revalidate, useParams } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { StatusCard } from "../../entities/status/StatusCard";
import { outlineButton } from "../../ui/outline-button";
import { ProfileHeader } from "./ProfileHeader";
import type { Account } from "./profile-api";
import { createProfilePostsStore } from "./profile-posts-store";
import { profileQuery } from "./profile-query";

// The plane the profile is drawn on, built like the timeline's panel
// (TimelineShell.tsx): full-bleed on mobile by escaping `main`'s px-4/py-4
// (App.tsx), framed from `md` up, where the column is capped.
const plane = css({
  bg: "bg.surface",
  mx: "-4",
  mt: "-4",
  md: {
    mx: "0",
    mt: "0",
    borderWidth: "1px",
    borderColor: "border.default",
    borderRadius: "md",
    // The header image is the plane's own top edge, so the frame has to clip
    // it or its square corners would cut across the rounded ones. Safe here in
    // a way it would not be in TimelineShell: nothing inside this plane is
    // `position: sticky`, so there is no containing block to re-scope.
    overflow: "hidden",
  },
});

// The list starts where the identity block ends; the rule is the list's,
// drawn once at its top rather than under the header's padding.
const postList = css({
  display: "flex",
  flexDirection: "column",
  borderTopWidth: "1px",
  borderColor: "border.default",
});

// Same row rhythm as the timeline (docs/design/timeline-density.md): a
// full-bleed row with one hairline underneath, the 12px inset carried by the
// card so a tap anywhere on it still opens the conversation (StatusCard.tsx).
// Per-framing chrome is that component's contract, not duplication.
const postRow = css({
  borderBottomWidth: "1px",
  borderColor: "border.default",
});

const postRowBody = css({ px: "3", py: "3" });

// Whichever of the loading/empty states shows is alone under the header, so it
// takes the row inset without the rule.
const noticeRow = css({
  px: "3",
  py: "3",
  color: "text.muted",
});

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

const httpMessage = (status: number, message: string | undefined): string => {
  // Akkoma answers an unauthenticated request with either code depending on
  // the endpoint, so both mean "no valid user" (TimelinePage.tsx).
  if (status === 401 || status === 403) {
    return "Sign-in required to view this profile.";
  }
  if (status === 404) return "This account is not on this instance.";
  return `Request failed (${status}${message ? `: ${message}` : ""}).`;
};

// A 404 is the one answer that repeating the request cannot change.
const retryable = (error: ApiError): boolean =>
  error.kind === "network" || error.status !== 404;

// Errors are ordinary render branches, not exceptions (ADR-0008). Shared by
// the account fetch and the first page of posts: both leave the same hole in
// the page and are recovered the same way, only the call behind Retry differs.
const ProfileError = (props: { error: ApiError; onRetry: () => void }) => (
  <p class={errorBox} role="alert">
    {props.error.kind === "network"
      ? "Connection failed — check your network."
      : httpMessage(props.error.status, props.error.message)}{" "}
    <Show when={retryable(props.error)}>
      <button
        type="button"
        class={outlineButton({ tone: "error" })}
        onClick={props.onRetry}
      >
        Retry
      </button>
    </Show>
  </p>
);

const olderErrorMessage = (error: ApiError): string =>
  error.kind === "network"
    ? "Couldn't load more — check your network."
    : `Couldn't load more (${error.status}).`;

// The list's own end while more is coming: no closing rule, since the last
// post row's rule already sits above it and nothing follows.
const sentinelRow = css({
  display: "flex",
  justifyContent: "center",
  px: "3",
  py: "3",
  // Never a scroll-anchor candidate (ADR-0004 amendment): anchoring to a row
  // that is replaced as the list grows would slide the viewport instead of
  // holding still on the posts around it.
  overflowAnchor: "none",
});

// Vertical padding is the enclosing row's, not this line's — stacking the two
// would leave the failure state taller than the loading state it replaces.
const inlineErrorRow = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  color: "error.default",
  fontSize: "sm",
});

const caughtUpRow = css({
  color: "text.muted",
  fontSize: "sm",
  textAlign: "center",
  px: "3",
  py: "3",
  // Replaces the sentinel, so it has to be just as anchor-inert as the row it
  // replaces.
  overflowAnchor: "none",
});

// Thin shim over IntersectionObserver: visibility alone decides to call
// `props.onVisible`; the exhausted/in-flight/failed guards live in the store
// and in the caller's `requestOlder` gate. happy-dom's IntersectionObserver
// never actually calls back — page tests substitute a fake that captures this
// callback for manual invocation instead.
const PostsSentinel = (props: {
  loading: boolean;
  error: ApiError | undefined;
  onVisible: () => void;
  // Distinct from `onVisible`, which is gated on the current state: Retry is
  // the user overriding a failure, so it goes straight to the store.
  onRetry: () => void;
}) => {
  let target: HTMLDivElement | undefined;

  // Keeps the error row (and its Retry button) mounted through a retry cycle.
  // `props.error` goes undefined the instant Retry dispatches — the store
  // clears it before the fetch starts (profile-posts-store.ts) — so gating the
  // row on `props.error` alone would swap it for the plain "Loading more…" row
  // mid-click and drop focus to `<body>`. `retrying` bridges that gap.
  const [retrying, setRetrying] = createSignal(false);

  // `defer: true`: only `loading`'s own transitions clear `retrying`, not the
  // effect's first run, which would otherwise clear the flag the click just
  // set.
  createEffect(
    on(
      () => props.loading,
      (loading) => {
        if (!loading) setRetrying(false);
      },
      { defer: true },
    ),
  );

  const handleRetryClick = () => {
    if (props.loading) return;
    setRetrying(true);
    props.onRetry();
  };

  onMount(() => {
    if (target === undefined) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) props.onVisible();
    });
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div ref={target} class={sentinelRow}>
      <Show when={props.error !== undefined || retrying()}>
        <p
          role={props.error === undefined ? undefined : "alert"}
          class={inlineErrorRow}
        >
          <Show when={props.error}>
            {(error) => olderErrorMessage(error())}
          </Show>
          <button
            type="button"
            class={outlineButton({ tone: "neutral" })}
            aria-disabled={props.loading ? "true" : undefined}
            onClick={handleRetryClick}
          >
            {props.loading ? "Retrying…" : "Retry"}
          </button>
        </p>
      </Show>
      <Show when={props.error === undefined && !retrying() && props.loading}>
        <p role="status" class={css({ color: "text.muted", fontSize: "sm" })}>
          Loading more…
        </p>
      </Show>
    </div>
  );
};

/**
 * Header plus posts for one account, recreated whenever that account changes:
 * the posts store it owns starts empty and is never reset, so the previous
 * profile's posts cannot survive into the next one.
 */
const ProfileBody = (props: { account: Account; acct: string }) => {
  const store = createProfilePostsStore(props.acct);
  onMount(() => void store.loadInitial());

  // The store's dedupe absorbs re-fires on its own; this gate is what keeps an
  // IntersectionObserver re-fire (any scroll jiggle while the error row is on
  // screen) from clearing a failure and re-requesting without the reader
  // asking — once a Retry affordance is shown, retrying is their call.
  const requestOlder = () => {
    if (
      store.exhausted() ||
      store.loadingOlder() ||
      store.loadOlderError() !== undefined
    )
      return;
    void store.loadOlder();
  };

  return (
    <>
      <ProfileHeader account={props.account} />
      <div class={postList}>
        <Show when={store.loading()}>
          <p role="status" class={noticeRow}>
            Loading…
          </p>
        </Show>

        <Show when={store.error()} keyed>
          {(failure) => (
            <ProfileError
              error={failure}
              onRetry={() => void store.loadInitial()}
            />
          )}
        </Show>

        {/* Empty-success state: the fetch settled without posts and without an
            error. Distinct from the loading and failure rows above. */}
        <Show
          when={
            !store.loading() &&
            store.error() === undefined &&
            store.statuses().length === 0
          }
        >
          <p role="status" class={noticeRow}>
            No posts yet.
          </p>
        </Show>

        <For each={store.statuses()}>
          {(status) => (
            <div class={postRow}>
              <StatusCard status={status} class={postRowBody} />
            </div>
          )}
        </For>

        <Show when={store.statuses().length > 0}>
          <Show
            when={!store.exhausted()}
            fallback={
              <p role="status" class={caughtUpRow}>
                You're all caught up.
              </p>
            }
          >
            <PostsSentinel
              loading={store.loadingOlder()}
              error={store.loadOlderError()}
              onVisible={requestOlder}
              onRetry={() => void store.loadOlder()}
            />
          </Show>
        </Show>
      </div>
    </>
  );
};

/**
 * One account's profile: the identity block over the account's posts
 * (`exclude_replies=true` — profile-api.ts). Tabs, the relationship badge and
 * pinned posts are later work; the wireframe
 * (docs/design/profile-page-20260830.html) shows where they go.
 */
export const ProfilePage = () => {
  // Untyped useParams is an index signature — bracket access then trips
  // useLiteralKeys, dot access noPropertyAccessFromIndexSignature.
  const params = useParams<{ acct: string }>();

  // `createAsync` keeps answering with the previous account's value while a
  // new `:acct` loads, so the acct travels with the answer: pairing it with
  // the current one files one account's profile under another's URL. Both
  // statements stay ahead of the first await — `query` registers against the
  // calling listener, which an await would lose, and with it `revalidate`'s
  // hold.
  const account = createAsync(async () => {
    const acct = params.acct;
    return { acct, result: await profileQuery(acct) };
  });
  const answer = () => {
    const current = account();
    return current === undefined || current.acct !== params.acct
      ? undefined
      : current.result;
  };

  const loadedAccount = (): Account | undefined => {
    const result = answer();
    return result === undefined || !result.ok ? undefined : result.value;
  };
  const error = () => {
    const result = answer();
    return result === undefined || result.ok ? undefined : result.error;
  };
  const retry = () => void revalidate(profileQuery.keyFor(params.acct));

  return (
    <section class={plane}>
      <Show when={error()} keyed>
        {(failure) => <ProfileError error={failure} onRetry={retry} />}
      </Show>

      {/* Keyed: a change of `:acct` alone does not remount this page, so the
          body — and the posts store inside it — is recreated by this `Show`
          instead. Nothing here resets the store by hand. */}
      <Show when={loadedAccount()} keyed>
        {(loaded) => <ProfileBody account={loaded} acct={params.acct} />}
      </Show>
    </section>
  );
};
