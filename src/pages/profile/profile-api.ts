import { type ApiError, client, toResult } from "../../api/client";
import { PAGE_LIMIT } from "../../api/pagination";
import type { Result } from "../../api/result";
import type { components } from "../../api/schema";
import type { Status } from "../../entities/status/types";
import type { ProfileTab } from "./profile-tabs";

// Named here rather than in an entity module: the full account shape is what
// the profile and the account lists (this page's follow lists and the lists
// under a post, src/pages/thread/who-lists-api.ts) draw, while
// `Status["account"]` (the card's abbreviated author) is a different need
// (entities/status/types.ts).
export type Account = components["schemas"]["Account"];

/**
 * The account `acct` names. The `{id}` slot takes a nickname as well as a
 * flake id, remote `user@domain` included — measured 2026-08-30 against the
 * reference instance, raw `@` and percent-encoded alike — which is what lets
 * the route's `:acct` be handed straight to it.
 *
 * `with_relationships` folds the viewer's relationship into
 * `pleroma.relationship` (null without it). Anonymous callers get the full
 * shape with every flag false rather than an error (measured 2026-08-30).
 */
export const fetchAccount = (
  acct: string,
): Promise<Result<Account, ApiError>> =>
  toResult(
    client.GET("/api/v1/accounts/{id}", {
      params: { path: { id: acct }, query: { with_relationships: true } },
    }),
  );

/**
 * One page of the account's posts, oldest-bound by `maxId`, narrowed by the
 * tab's `filter` (profile-tabs.ts).
 *
 * `exclude_replies` (the Posts tab) is what makes that list "posts" rather
 * than "posts and replies". Akkoma applies it to self-replies too (measured
 * 2026-08-30: a self-reply present without the flag is gone with it), so a
 * thread its own author continued shows only its opening post there. Taken as
 * the endpoint's meaning — filtering client-side would drop items out of a
 * page whose length is what decides whether more exist.
 */
export const fetchAccountPosts = (
  acct: string,
  params: { maxId?: string; filter: ProfileTab["filter"] },
): Promise<Result<Status[], ApiError>> =>
  toResult(
    client.GET("/api/v1/accounts/{id}/statuses", {
      params: {
        path: { id: acct },
        query: {
          ...params.filter,
          limit: PAGE_LIMIT,
          // Spread rather than `max_id: params.maxId`: under
          // exactOptionalPropertyTypes an optional key does not accept an
          // explicit undefined, so the first page omits the key instead.
          ...(params.maxId === undefined ? {} : { max_id: params.maxId }),
        },
      },
    }),
  );

/**
 * The account's pinned posts, the strip above the Posts tab's list. One
 * request, not paged: Akkoma sends a Link header here like anywhere else, but
 * a featured collection fits in a page.
 *
 * No tab filter, deliberately: Akkoma ANDs `pinned` with `exclude_replies`
 * (measured 2026-09-13 against the reference instance), so passing the Posts
 * tab's filter would hide a pinned reply. The count can exceed the instance's
 * `max_pinned_statuses` — that limit governs local pin actions, while a remote
 * account's federated featured collection arrives whole.
 */
export const fetchPinnedPosts = (
  acct: string,
): Promise<Result<Status[], ApiError>> =>
  toResult(
    client.GET("/api/v1/accounts/{id}/statuses", {
      params: {
        path: { id: acct },
        query: { pinned: true, limit: PAGE_LIMIT },
      },
    }),
  );
