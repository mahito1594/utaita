import { createAsync, useParams } from "@solidjs/router";
import { For, onCleanup, onMount, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import { claimRetentionFrame } from "../../entities/retention/retention";
import { acctFromPath } from "../../entities/status/mention";
import { AccountRow } from "./AccountRow";
import {
  followListPath,
  type FollowList as ListDefinition,
  listHidden,
} from "./follow-list";
import {
  createFollowListStore,
  type FollowListSnapshot,
} from "./follow-list-store";
import { ErrorCard, noticeRow, PostsSentinel } from "./ProfilePage";
import { profileQuery } from "./profile-query";

// Body of the plane below the header: no padding and no gap of its own, so the
// rules the rows draw span it and the rows carry the inset (ThreadPage.tsx).
const accountList = css({
  display: "flex",
  flexDirection: "column",
  listStyleType: "none",
});

// The list failing is one region of a page that otherwise arrived, so the copy
// names the region — the header above it is proof the account exists.
const listErrorMessage = (list: ListDefinition, error: ApiError): string => {
  const what =
    list.kind === "following"
      ? "who this account follows"
      : "this account's followers";
  return error.kind === "network"
    ? `Couldn't load ${what} — check your network.`
    : `Couldn't load ${what} (${error.status}).`;
};

/**
 * Who an account follows, or who follows it: a leaf of the profile route
 * (App.tsx) drawn under the same header as the post tabs. A new `acct` or a
 * new side is a new mount, so the store it owns is never reset by hand.
 */
export const FollowList = (props: { list: ListDefinition }) => {
  const params = useParams<{ acct: string }>();
  // The decoded acct, so `/users/alice%40remote.example` and the raw spelling
  // the app links to claim one frame rather than two.
  const acct = acctFromPath(params.acct);
  // Claimed before the store exists, because what the frame hands back is what
  // the store starts from: this list as the reader left it when they pop back
  // onto this entry, nothing otherwise.
  const slot = claimRetentionFrame<FollowListSnapshot>(
    followListPath(acct, props.list),
  );
  const store = createFollowListStore(acct, props.list, slot.restored);
  // Unconditional: whether a first page is still owed is the store's state,
  // and a second reading of it here would be free to disagree with it
  // (ADR-0004 amendment 2026-08-09).
  onMount(() => void store.loadInitial());
  onCleanup(() => {
    // An empty list is not a reading position, and resuming from one would
    // strand the page: the store would consider its first load done and settle
    // on the empty-success row with no fetch coming.
    const accounts = store.accounts();
    if (accounts.length === 0) return;
    slot.retain({ accounts, exhausted: store.exhausted() });
  });

  // A cache hit on the account the route already loaded (profile-query.ts).
  // No acct travels with the answer as it does on the page above: this leaf
  // lives inside the profile body, which is recreated per acct
  // (ProfilePage.tsx), so a stale answer cannot reach it.
  const account = createAsync(() => profileQuery(acct));
  // Akkoma answers a withheld list with an empty page rather than an error, so
  // the flag is what tells the reader which of the two empty states they are
  // looking at (follow-list.ts).
  const hidden = () => {
    const result = account();
    return result?.ok === true && listHidden(result.value, props.list);
  };

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
    <div>
      <Show when={store.loading()}>
        <p role="status" class={noticeRow}>
          Loading…
        </p>
      </Show>

      {/* Retry is always offered here, 404 included: this endpoint answers
          for an account that has already been found, so a missing list is a
          transient answer rather than a settled one. */}
      <Show when={store.error()}>
        {(failure) => (
          <ErrorCard
            message={listErrorMessage(props.list, failure())}
            onRetry={() => void store.loadInitial()}
          />
        )}
      </Show>

      {/* Empty-success state: the fetch settled without accounts and without
          an error. Distinct from the loading and failure rows above. */}
      <Show
        when={
          !store.loading() &&
          store.error() === undefined &&
          store.accounts().length === 0
        }
      >
        <p role="status" class={noticeRow}>
          {hidden() ? props.list.hidden : props.list.empty}
        </p>
      </Show>

      <Show when={store.accounts().length > 0}>
        {/* biome-ignore lint/a11y/noRedundantRoles: Safari drops the implied role under list-style:none */}
        <ol class={accountList} role="list">
          <For each={store.accounts()}>
            {(account) => <AccountRow account={account} />}
          </For>
        </ol>

        {/* No closing row when the list ends: unlike the post list, there is
            nothing left to say once the last account is on screen. */}
        <Show when={!store.exhausted()}>
          <PostsSentinel
            loading={store.loadingOlder()}
            error={store.loadOlderError()}
            onVisible={requestOlder}
            onRetry={() => void store.loadOlder()}
          />
        </Show>
      </Show>
    </div>
  );
};
