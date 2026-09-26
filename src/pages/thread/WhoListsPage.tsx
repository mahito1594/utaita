import {
  A,
  createAsync,
  revalidate,
  useNavigate,
  useParams,
} from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import {
  createRenderEffect,
  For,
  on,
  type ParentProps,
  Show,
  Suspense,
} from "solid-js";
import { css } from "../../../styled-system/css";
import { markRetentionFrame } from "../../entities/retention/retention";
import { failureMessage } from "../../entities/session/failure-message";
import { authenticated, offersSignIn } from "../../entities/session/session";
import { EmojiText } from "../../entities/status/EmojiText";
import { parseEmojiReactions } from "../../entities/status/parse";
import { ReactionChip } from "../../entities/status/ReactionChips";
import type { Status } from "../../entities/status/types";
import { statusPath } from "../../entities/status/url";
import { ghostIconButton } from "../../ui/ghost-icon-button";
import { AccountRow } from "../profile/AccountRow";
import { ErrorCard, noticeRow } from "../profile/ProfilePage";
import { threadQuery } from "./thread-query";
import {
  type AccountWhoList,
  type WhoList as ListDefinition,
  reactions,
  whoListPath,
  whoLists,
} from "./who-lists";
import {
  accountListQuery,
  reactionsQuery,
  type WhoListsArrival,
} from "./who-lists-query";

const headerRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  mb: "3",
});

// The plane the tabs and the rows are drawn on, built like the conversation's
// (ThreadPage.tsx): full-bleed on mobile by escaping `main`'s px-4 (App.tsx),
// framed from `md` up, where the column is capped. Clipped with `clip`, not
// `hidden`: `hidden` is a scrolling mechanism and would re-scope the group
// bands' `position: sticky` to this never-scrolling box
// (https://developer.mozilla.org/en-US/docs/Web/CSS/position).
const plane = css({
  bg: "bg.surface",
  mx: "-4",
  md: {
    mx: "0",
    borderWidth: "1px",
    borderColor: "border.default",
    borderRadius: "md",
    overflow: "clip",
  },
});

// The profile's tab bar (ProfilePage.tsx), duplicated as the second bar of
// this shape — minus its top rule, since here the bar is the plane's own top
// edge and the two lines would sit on each other.
const tabBar = css({ display: "flex" });

// Router-driven active styling: `<A>` sets `aria-current="page"` on an exact
// match, which is the only state saying which list is open.
const tabLink = css({
  flex: 1,
  textAlign: "center",
  py: "3",
  fontSize: "sm",
  fontWeight: "semibold",
  color: "text.muted",
  borderBottomWidth: "2px",
  borderBottomColor: "transparent",
  "&[aria-current=page]": {
    color: "text.brand",
    borderBottomColor: "accent.default",
  },
});

// A separate element after the label, so the tab's accessible name still
// starts with the word the reader is looking for.
const tabCount = css({ ml: "1", fontWeight: "normal" });

// Body of the plane below the bar: no padding and no gap of its own, so the
// rules the rows draw span it and the rows carry the inset (FollowList.tsx).
const accountList = css({
  display: "flex",
  flexDirection: "column",
  listStyleType: "none",
});

/**
 * Everyone who favourited or boosted the post, one flat list of accounts. A
 * leaf of the who-lists route (App.tsx): a new `:id` or a new tab is a new
 * list, and neither endpoint pages (who-lists-api.ts), so there is no store
 * and no snapshot to keep.
 */
export const WhoList = (props: { list: AccountWhoList }) => {
  const params = useParams<{ id: string }>();
  // The list failing is one region of a page that otherwise arrived, so the
  // copy names the region rather than the page (FollowList.tsx does the same).
  const what = () =>
    props.list.kind === "favourites"
      ? "who favourited this post"
      : "who boosted this post";

  // The page keeps nothing of its own, but it still takes a place in the
  // retention stack so that a pop past it lands where the reader's history
  // says it should (src/entities/retention/retention.tsx). Per `:id` rather
  // than per mount, as the conversation does it (ThreadPage.tsx).
  createRenderEffect(
    on(
      () => params.id,
      (id) => markRetentionFrame(whoListPath(id, props.list)),
    ),
  );

  // `createAsync` keeps answering with the previous post's value while a new
  // `:id` loads, so the id travels with the answer: pairing it with the
  // current one files one post's list under another's URL. Both statements
  // stay ahead of the first await — `query` registers against the calling
  // listener, which an await would lose, and with it `revalidate`'s hold.
  const answer = createAsync(async () => {
    const id = params.id;
    const fetchList = accountListQuery(props.list);
    return { id, result: await fetchList(id) };
  });
  const result = () => {
    const current = answer();
    return current === undefined || current.id !== params.id
      ? undefined
      : current.result;
  };
  const accounts = () => {
    const settled = result();
    return settled?.ok === true ? settled.value : [];
  };
  const error = () => {
    const settled = result();
    return settled === undefined || settled.ok ? undefined : settled.error;
  };
  const retry = () =>
    void revalidate(accountListQuery(props.list).keyFor(params.id));

  return (
    <div>
      {/* Retry is offered for a 404 too. Here it is Akkoma's verdict that the
          caller may not see the post (a post that is gone answers `200 []`,
          who-lists-api.ts), and the reactions tab says the same with a 403:
          one row shape for all three tabs rather than a rule per status. A
          sign-in is the other way forward when the session is what the
          verdict turned on. */}
      <Show when={error()}>
        {(failure) => (
          <ErrorCard
            message={failureMessage(failure(), what(), authenticated())}
            onRetry={retry}
            signIn={offersSignIn(failure())}
          />
        )}
      </Show>

      {/* Empty-success state: the fetch settled without accounts and without
          an error — waiting for it is the page's Suspense, not a row here. */}
      <Show
        when={
          result() !== undefined &&
          error() === undefined &&
          accounts().length === 0
        }
      >
        <p role="status" class={noticeRow}>
          {props.list.empty}
        </p>
      </Show>

      <Show when={accounts().length > 0}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the implied role under list-style:none */}
        <ol class={accountList} role="list">
          <For each={accounts()}>
            {(account) => <AccountRow account={account} />}
          </For>
        </ol>
      </Show>
    </div>
  );
};

// The band naming one group, built like the follow lists' (FollowList.tsx)
// and the detached posts' (ThreadPage.tsx): same inset, but what it holds is
// the chip the post's own card draws, not a line of text. A chip alone read as
// another row, so the band is tinted, shorter than a row's `py: "3"`
// (AccountRow.tsx), and closed by a rule twice theirs — the palette has one
// border tone (panda.config.ts).
const groupHeading = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "3",
  py: "1",
  bg: "bg.subtle",
  // Which emoji's accounts are on screen, while they are: neither the tab bar
  // above nor the app header (App.tsx) is sticky, so the viewport top is free.
  position: "sticky",
  top: "0",
  zIndex: "1",
  borderBottomWidth: "2px",
  borderColor: "border.default",
});

// What the chip's bare number counts, which nothing else on the band says.
const groupCount = css({ fontSize: "xs", color: "text.muted" });

/**
 * Everyone who reacted to the post, one section per emoji. The endpoint
 * returns the groups already assembled, accounts included (who-lists-api.ts),
 * so the whole tab is one request and, like its siblings, one page.
 */
const peopleOf = (count: number): string =>
  count === 1 ? "1 person" : `${count} people`;

export const ReactionsList = () => {
  const params = useParams<{ id: string }>();

  createRenderEffect(
    on(
      () => params.id,
      (id) => markRetentionFrame(whoListPath(id, reactions)),
    ),
  );

  // Same shape as the flat lists above, for the same reason: the answer
  // carries the id it was asked for, and both statements stay ahead of the
  // first await so `query` sees the calling listener.
  const answer = createAsync(async () => {
    const id = params.id;
    return { id, result: await reactionsQuery(id) };
  });
  const result = () => {
    const current = answer();
    return current === undefined || current.id !== params.id
      ? undefined
      : current.result;
  };
  const groups = () => {
    const settled = result();
    return settled?.ok === true ? settled.value : [];
  };
  const error = () => {
    const settled = result();
    return settled === undefined || settled.ok ? undefined : settled.error;
  };
  const retry = () => void revalidate(reactionsQuery.keyFor(params.id));

  return (
    <div>
      {/* A post the caller may not see is a 403 here, where the two lists
          beside it answer 404 (who-lists-api.ts); neither is distinguished
          from a transient failure, so both get a Retry, and both offer a
          sign-in when one could change the verdict. */}
      <Show when={error()}>
        {(failure) => (
          <ErrorCard
            message={failureMessage(
              failure(),
              "who reacted to this post",
              authenticated(),
            )}
            onRetry={retry}
            signIn={offersSignIn(failure())}
          />
        )}
      </Show>

      {/* Also the answer of an instance running with `show_reactions: false`,
          which withholds the list as an empty one rather than as an error. */}
      <Show
        when={
          result() !== undefined &&
          error() === undefined &&
          groups().length === 0
        }
      >
        <p role="status" class={noticeRow}>
          {reactions.empty}
        </p>
      </Show>

      <For each={groups()}>
        {(group) => (
          // Named by the emoji, which is all that tells one group of rows from
          // the next — the chip drawing it is an image for a custom emoji.
          <section aria-label={group.name}>
            {/* A heading, so the groups can be jumped between; preflight
                resets its font-size, weight and margin, so it needs no type.
                Named outright, or the chip's own count would read twice. */}
            <h3
              class={groupHeading}
              aria-label={`${group.name}, ${peopleOf(group.count)}`}
            >
              <ReactionChip reaction={group} />
              <span class={groupCount}>{peopleOf(group.count)}</span>
            </h3>
            {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the implied role under list-style:none */}
            <ol class={accountList} role="list">
              <For each={group.accounts}>
                {(account) => <AccountRow account={account} />}
              </For>
            </ol>
          </section>
        )}
      </For>
    </div>
  );
};

/**
 * The three lists behind one post's counts, under a header naming the post
 * and a tab bar carrying the counts themselves (who-lists.ts). The lists are
 * its leaves (App.tsx), so switching tabs replaces the rows and keeps the
 * header.
 */
export const WhoListsPage = (props: ParentProps<{ data: WhoListsArrival }>) => {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();

  // A cache hit on the conversation the reader came from, and the request the
  // preload started on a direct arrival (who-lists-query.ts). The id travels
  // with the answer for the same reason it does in the leaf.
  const thread = createAsync(async () => {
    const id = params.id;
    return { id, result: await threadQuery(id) };
  });
  const subject = (): Status | undefined => {
    const current = thread();
    return current === undefined ||
      current.id !== params.id ||
      !current.result.ok
      ? undefined
      : current.result.value.subject;
  };

  // Named by their author, as a post is in conversation. An account whose
  // display name is blank is named by its acct, as it is on a card
  // (StatusCard.tsx).
  const author = () => {
    const account = subject()?.account;
    if (account === undefined) return undefined;
    const name = account.display_name || account.acct || "";
    return name === "" ? undefined : { name, emojis: account.emojis ?? [] };
  };

  // Keyed by `WhoList["kind"]`, so a tab reads its own count by definition.
  // The reaction tab counts reactions, not reacting accounts: the same
  // account may hold several, and each is a row of its own under its emoji.
  const counts = () => {
    const status = subject();
    if (status === undefined) return undefined;
    return {
      favourites: status.favourites_count ?? 0,
      boosts: status.reblogs_count ?? 0,
      reactions: parseEmojiReactions(status).reduce(
        (total, reaction) => total + reaction.count,
        0,
      ),
    };
  };

  return (
    <section>
      <div class={headerRow}>
        {/* History back, not a link, whenever there is an entry behind: scroll
            restoration only applies to traversals, so a link would drop the
            reading position the conversation was left at (ADR-0004
            amendment). A page opened straight from a link has no such entry,
            and the post the list belongs to is where it leads instead. */}
        <Show
          when={props.data.canGoBack}
          fallback={
            <A
              href={statusPath(params.id)}
              aria-label="Back"
              class={ghostIconButton}
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </A>
          }
        >
          <button
            type="button"
            aria-label="Back"
            class={ghostIconButton}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        </Show>
        <h2 class={css({ fontSize: "sm", fontWeight: "semibold" })}>
          {/* Until the conversation's answer lands — or when it fails, which
              the lists themselves survive — the post is all the heading can
              name. Its own boundary, so waiting for the author holds back the
              heading alone. */}
          <Suspense fallback="Post">
            <Show when={author()} fallback="Post">
              {(who) => (
                <>
                  Post by <EmojiText text={who().name} emojis={who().emojis} />
                </>
              )}
            </Show>
          </Suspense>
        </h2>
      </div>

      <div class={plane}>
        <nav aria-label="Post sections" class={tabBar}>
          <For each={whoLists}>
            {(list: ListDefinition) => (
              // A tab switch is a move within one page, so it replaces the
              // entry instead of adding one: Back stays a history back out of
              // the page, which scroll restoration needs (docs/stories.ja.md).
              <A href={whoListPath(params.id, list)} replace class={tabLink}>
                {list.label}
                {/* The count alone waits for the conversation: without a
                    boundary here the tabs would be unreachable until it
                    answers, on the arrival that needs them most. */}
                <Suspense>
                  <Show when={counts()}>
                    {(known) => (
                      <span class={tabCount}>{known()[list.kind]}</span>
                    )}
                  </Show>
                </Suspense>
              </A>
            )}
          </For>
        </nav>
        {/* The page's own boundary: the layout's (App.tsx) would hide the
            header and the tabs with the list a direct arrival is waiting for.
            A tab switch renders under the router's transition, which keeps
            the previous list on screen, so this row is the direct arrival's. */}
        <Suspense
          fallback={
            <p role="status" class={noticeRow}>
              Loading…
            </p>
          }
        >
          {props.children}
        </Suspense>
      </div>
    </section>
  );
};
