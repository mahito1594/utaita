import { profilePath } from "../../entities/status/mention";
import type { Account } from "./profile-api";

/**
 * One side of an account's social graph: a path under `/accounts/:acct`, the
 * `AccountController` endpoint behind it (src/api/schema.d.ts), and the copy
 * for the two states that carry no rows. Same shape as the tab definitions
 * (profile-tabs.ts): the route table and every link read these, so neither can
 * name a path the other lacks.
 */
export type FollowList = {
  kind: "following" | "followers";
  path: "/following" | "/followers";
  label: string;
  /** The account has no one on this side of its graph. */
  empty: string;
  /** The account withholds this side from readers other than itself. */
  hidden: string;
};

export const following: FollowList = {
  kind: "following",
  path: "/following",
  label: "Following",
  empty: "Not following anyone yet.",
  hidden: "This account doesn't show who they follow.",
};

export const followers: FollowList = {
  kind: "followers",
  path: "/followers",
  label: "Followers",
  empty: "No followers yet.",
  hidden: "This account doesn't show who follows them.",
};

/** The list's absolute URL; `profilePath` stays the one source of the shape. */
export const followListPath = (acct: string, list: FollowList): string =>
  `${profilePath(acct)}${list.path}`;

/**
 * Whether the account withholds this side of its graph. Akkoma answers a
 * withheld list with 200 and an empty array to everyone but the owner, so the
 * flag is the only thing that tells "hidden" from "nobody"
 * (lib/pleroma/web/mastodon_api/controllers/account_controller.ex).
 */
export const listHidden = (account: Account, list: FollowList): boolean =>
  Boolean(
    list.kind === "following"
      ? account.pleroma?.hide_follows
      : account.pleroma?.hide_followers,
  );
