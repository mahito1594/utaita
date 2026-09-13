import { type ApiError, client, toResult } from "../../api/client";
import type { Result } from "../../api/result";
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
