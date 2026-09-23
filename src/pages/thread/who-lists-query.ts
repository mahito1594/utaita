import { query, type RoutePreloadFunc } from "@solidjs/router";
import { threadQuery } from "./thread-query";
import type { AccountWhoList } from "./who-lists";
import {
  fetchFavouritedBy,
  fetchReactions,
  fetchRebloggedBy,
} from "./who-lists-api";

/**
 * The accounts behind one of a post's counts, cached by the router's data
 * layer under a key of its own per list — the same id means a different list
 * on each of them.
 *
 * The failure is a value, not a rejection (ADR-0008) — which also means a
 * failed list is cached like any other answer, and retrying is
 * `revalidate(...keyFor(id))` rather than calling again.
 */
const favouritedByQuery = query(fetchFavouritedBy, "who-favourites");
const rebloggedByQuery = query(fetchRebloggedBy, "who-boosts");
export const reactionsQuery = query(fetchReactions, "who-reactions");

/** The cached fetch behind a list, and the `keyFor` a Retry revalidates. */
export const accountListQuery = (list: AccountWhoList) =>
  list.kind === "favourites" ? favouritedByQuery : rebloggedByQuery;

/** What the navigation that first landed on the route decides about the page. */
export type WhoListsArrival = {
  /** Whether a history back leads anywhere inside the app. */
  readonly canGoBack: boolean;
};

/**
 * Warms the subject's thread cache — the heading and the tab counts read it —
 * and reads what only the router knows at this point about the navigation:
 * "initial" is a document's first render, the one arrival with nothing behind
 * it in this app's history, and so the one where a back control has to become
 * a link to the post instead.
 *
 * Deliberately not `preloadThread` (thread-query.ts): that also marks a
 * thread-open intent, which is the conversation's cue to scroll its subject
 * into view — and nobody is opening the conversation here.
 */
export const preloadWhoLists: RoutePreloadFunc<WhoListsArrival> = ({
  params,
  intent,
}) => {
  const { id } = params;
  if (id !== undefined) void threadQuery(id);
  return { canGoBack: intent !== "initial" };
};
