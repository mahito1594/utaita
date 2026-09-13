import { type ApiError, client, toResult } from "../../api/client";
import { PAGE_LIMIT } from "../../api/pagination";
import type { Result } from "../../api/result";
import type { FollowList } from "./follow-list";
import type { Account } from "./profile-api";
import { profileQuery } from "./profile-query";

/**
 * One page of the accounts on `list`'s side of `acct`'s graph, oldest-bound by
 * `maxId` — which is the tail account's own id, the cursor the endpoint itself
 * paginates by (measured 2026-09-13 against the reference instance).
 *
 * Unlike `show` and `statuses`, these two endpoints take the flake id only: a
 * nickname is a 404 (Akkoma's `assign_account_by_id`,
 * lib/pleroma/web/controller_helper.ex). The id comes from the account the
 * profile route already loaded, so this costs no extra request. When it is
 * absent — `id` is optional in the generated type — the acct goes out as
 * written and the server's 404 lands in the list's error row, rather than
 * being invented here.
 */
export const fetchFollowList = async (
  acct: string,
  list: FollowList,
  params: { maxId?: string },
): Promise<Result<Account[], ApiError>> => {
  const account = await profileQuery(acct);
  if (!account.ok) return account;

  const query = {
    limit: PAGE_LIMIT,
    // Spread rather than `max_id: params.maxId`: under
    // exactOptionalPropertyTypes an optional key does not accept an explicit
    // undefined, so the first page omits the key instead.
    ...(params.maxId === undefined ? {} : { max_id: params.maxId }),
  };
  const path = { id: account.value.id ?? acct };

  // Two calls rather than one on a computed path: openapi-fetch keys its types
  // off the path string literal.
  return toResult(
    list.kind === "following"
      ? client.GET("/api/v1/accounts/{id}/following", {
          params: { path, query },
        })
      : client.GET("/api/v1/accounts/{id}/followers", {
          params: { path, query },
        }),
  );
};
