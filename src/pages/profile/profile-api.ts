import { type ApiError, client, toResult } from "../../api/client";
import type { Result } from "../../api/result";
import type { components } from "../../api/schema";
import type { Status } from "../../entities/status/types";
import type { ProfileTab } from "./profile-tabs";

// Named here rather than in an entity module: the profile page is the only
// consumer, and `Status["account"]` (the card's abbreviated author) is a
// different need from the full profile (entities/status/types.ts).
export type Account = components["schemas"]["Account"];

// Same server-side clamp as every list endpoint (ADR-0004 amendment): a page
// that comes back exactly this long cannot rule out more posts below it.
export const POSTS_PAGE_LIMIT = 40;

/**
 * The account `acct` names. The `{id}` slot takes a nickname as well as a
 * flake id, remote `user@domain` included — measured 2026-08-30 against the
 * reference instance, raw `@` and percent-encoded alike — which is what lets
 * the route's `:acct` be handed straight to it.
 */
export const fetchAccount = (
  acct: string,
): Promise<Result<Account, ApiError>> =>
  toResult(
    client.GET("/api/v1/accounts/{id}", { params: { path: { id: acct } } }),
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
          limit: POSTS_PAGE_LIMIT,
          // Spread rather than `max_id: params.maxId`: under
          // exactOptionalPropertyTypes an optional key does not accept an
          // explicit undefined, so the first page omits the key instead.
          ...(params.maxId === undefined ? {} : { max_id: params.maxId }),
        },
      },
    }),
  );
