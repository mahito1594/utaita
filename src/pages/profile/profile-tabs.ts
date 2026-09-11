import { profilePath } from "../../entities/status/mention";

/**
 * One tab of the profile's post list: a path under `/users/:acct` and the
 * query it adds to `AccountController.statuses` (src/api/schema.d.ts). Same
 * shape as the timeline definitions (timelines.ts): the route table and the
 * tab bar both read these, so neither can link to a path the other lacks.
 */
export type ProfileTab = {
  label: string;
  path: "/" | "/with_replies" | "/media";
  filter: { exclude_replies?: true; only_media?: true };
};

export const posts: ProfileTab = {
  label: "Posts",
  path: "/",
  filter: { exclude_replies: true },
};

export const postsAndReplies: ProfileTab = {
  label: "Posts & replies",
  path: "/with_replies",
  filter: {},
};

export const media: ProfileTab = {
  label: "Media",
  path: "/media",
  filter: { only_media: true },
};

export const profileTabs = [posts, postsAndReplies, media] as const;

/** The tab's absolute URL; `profilePath` stays the one source of the shape. */
export const profileTabPath = (acct: string, tab: ProfileTab): string =>
  tab.path === "/" ? profilePath(acct) : `${profilePath(acct)}${tab.path}`;
