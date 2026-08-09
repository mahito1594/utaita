import { type ApiError, client, toResult } from "../../api/client";
import { ok, type Result } from "../../api/result";
import type { operations } from "../../api/schema";
import type { Status } from "../../entities/status/types";

// The instance spec types both bodies inline rather than as named components,
// so they are named here through `operations` — the one place that knows which
// operation each call belongs to.
export type ThreadContext =
  operations["StatusController.context"]["responses"][200]["content"]["application/json"];

type SearchResults =
  operations["SearchController.search2"]["responses"][200]["content"]["application/json"];

export const fetchStatus = (id: string): Promise<Result<Status, ApiError>> =>
  toResult(client.GET("/api/v1/statuses/{id}", { params: { path: { id } } }));

/**
 * The conversation around `id`. Its `ancestors` / `descendants` split is not
 * the thread's shape — see `buildThread` (thread-tree.ts), which derives the
 * shape from `in_reply_to_id` instead.
 */
export const fetchContext = (
  id: string,
): Promise<Result<ThreadContext, ApiError>> =>
  toResult(
    client.GET("/api/v1/statuses/{id}/context", { params: { path: { id } } }),
  );

/**
 * Asks the instance to ingest the post an AP id names, and hands back the
 * ingested status. This is a write to the instance's database and a remote
 * round trip (measured around 2.6s), so it belongs behind an explicit user
 * action, never behind rendering.
 *
 * `ok(null)` means the instance answered but the post is not on hand — a normal
 * outcome for a deleted or unreachable remote status, distinct from the request
 * itself failing.
 *
 * A result counts only when its `uri` is the AP id that was asked for. The
 * endpoint is a search: when the instance cannot obtain the post it falls back
 * to full-text hits for the AP id as a plain string, so a post that merely
 * links to it would otherwise pass for the real one. Rejecting a status stored
 * under some other canonical id costs nothing either — that id is also what the
 * instance matches a reply's `inReplyTo` against, so such a status would not
 * join the conversation on a reload however it were reported here.
 */
export const resolveStatus = async (
  apId: string,
): Promise<Result<Status | null, ApiError>> => {
  const result = await toResult<SearchResults>(
    client.GET("/api/v2/search", {
      params: { query: { q: apId, resolve: true } },
    }),
  );
  if (!result.ok) return result;
  const found = result.value.statuses?.find((status) => status.uri === apId);
  return ok(found ?? null);
};
