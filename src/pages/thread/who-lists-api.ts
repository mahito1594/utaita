import { type ApiError, client, toResult } from "../../api/client";
import { ok, type Result } from "../../api/result";
import type { EmojiReaction } from "../../entities/status/parse";
import type { Account } from "../profile/profile-api";

// Both endpoints answer with the whole list in one response: Akkoma reads them
// with `Repo.all` and attaches no Link header
// (lib/pleroma/web/mastodon_api/controllers/status_controller.ex,
// `favourited_by` / `reblogged_by`), so nothing here pages. A post the caller
// may not see is a 404 rather than an empty list.
//
// Two functions rather than one on a computed path: openapi-fetch keys its
// types off the path string literal.

/** Everyone who favourited the post. */
export const fetchFavouritedBy = (
  id: string,
): Promise<Result<Account[], ApiError>> =>
  toResult(
    client.GET("/api/v1/statuses/{id}/favourited_by", {
      params: { path: { id } },
    }),
  );

/** Everyone who boosted the post. */
export const fetchRebloggedBy = (
  id: string,
): Promise<Result<Account[], ApiError>> =>
  toResult(
    client.GET("/api/v1/statuses/{id}/reblogged_by", {
      params: { path: { id } },
    }),
  );

/**
 * One emoji and everyone who reacted with it. The reaction itself is the same
 * shape a card draws (src/entities/status/parse.ts); what this endpoint adds
 * over the copy embedded in a Status is the accounts themselves — the
 * embedded one carries `account_ids` only.
 */
export type ReactionGroup = EmojiReaction & { accounts: Account[] };

// Parsed at the boundary, as the embedded reactions are (parse.ts): every
// field of the answer is optional in the spec, and a reaction without a name
// is nothing this app can draw.
const parseGroups = (
  groups: {
    name?: string;
    count?: number;
    me?: boolean;
    url?: string | null;
    accounts?: Account[];
  }[],
): ReactionGroup[] => {
  const parsed: ReactionGroup[] = [];
  for (const group of groups) {
    if (group.name === undefined || group.name === "") continue;
    parsed.push({
      name: group.name,
      count: group.count ?? 0,
      me: group.me ?? false,
      url: typeof group.url === "string" ? group.url : null,
      accounts: group.accounts ?? [],
    });
  }
  return parsed;
};

/**
 * Everyone who reacted to the post, grouped per emoji — one page, like the
 * two lists above. A post the caller may not see is a 403 here rather than
 * the 404 the Mastodon-API endpoints answer, and an instance running with
 * `show_reactions: false` answers `200 []`.
 *
 * `emoji: ""` fills a path parameter the route has no slot for: openapi.json
 * gives `/api/v1/pleroma/statuses/{id}/reactions` the parameter list of
 * `/reactions/{emoji}`, so the generated type demands it. openapi-fetch
 * substitutes only the `{name}` segments the path template holds, leaving the
 * extra key unused.
 */
export const fetchReactions = async (
  id: string,
): Promise<Result<ReactionGroup[], ApiError>> => {
  const answer = await toResult(
    client.GET("/api/v1/pleroma/statuses/{id}/reactions", {
      params: { path: { id, emoji: "" } },
    }),
  );
  return answer.ok ? ok(parseGroups(answer.value)) : answer;
};
