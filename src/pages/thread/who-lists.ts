import { whoListPaths, whoListSegments } from "../../entities/status/url";

/**
 * One of the three lists behind a post's counts: a path under
 * `/statuses/:id`, the tab's label, and the copy for an answer with no rows.
 * Same shape as the follow lists (src/pages/profile/follow-list.ts): the route
 * table, the tab bar and every link into these read the same definitions, so
 * none of them can name a path another lacks.
 */
export type WhoList = {
  kind: keyof typeof whoListSegments;
  /** Route segment under `/statuses/:id`, as `whoListSegments` spells it. */
  path: (typeof whoListSegments)[keyof typeof whoListSegments];
  label: string;
  /**
   * Copy for a settled answer with no rows. It does not claim the count is
   * zero: Akkoma can withhold a list it still counts (`show_reactions: false`
   * answers `200 []`), and the tab shows the post's own count beside it.
   */
  empty: string;
};

/**
 * The two lists whose answer is a flat array of accounts. Reactions are
 * grouped per emoji and come from an endpoint of their own
 * (who-lists-api.ts), so the leaf that draws plain rows takes only these.
 */
export type AccountWhoList = WhoList & { kind: "favourites" | "boosts" };

export const favourites: AccountWhoList = {
  kind: "favourites",
  path: whoListSegments.favourites,
  label: "Favourites",
  empty: "No favourites to show.",
};

export const boosts: AccountWhoList = {
  kind: "boosts",
  path: whoListSegments.boosts,
  label: "Boosts",
  empty: "No boosts to show.",
};

export const reactions: WhoList = {
  kind: "reactions",
  path: whoListSegments.reactions,
  label: "Reactions",
  empty: "No reactions to show.",
};

/** Tab order, read by both the route table and the tab bar. */
export const whoLists: readonly WhoList[] = [favourites, boosts, reactions];

/** The list's absolute URL; `whoListPaths` stays the one source of the shape. */
export const whoListPath = (id: string, list: WhoList): string =>
  whoListPaths(id)[list.kind];
