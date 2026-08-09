import { query, type RoutePreloadFunc } from "@solidjs/router";
import type { ApiError } from "../../api/client";
import { ok, type Result } from "../../api/result";
import type { Status } from "../../entities/status/types";
import { fetchContext, fetchStatus, type ThreadContext } from "./thread-api";

export type Thread = {
  readonly subject: Status;
  readonly context: ThreadContext;
};

/**
 * The conversation around one status, as the two requests it takes: `/context`
 * never contains the status it is about, so the subject has to be fetched
 * alongside it.
 *
 * One cache entry for both, because they are only ever true together: ingesting
 * a previously unfetched parent rewrites the subject's own `in_reply_to_id`, so
 * a revalidation that refreshed the context alone would rebuild the tree from a
 * stale subject.
 *
 * The failure is a value, not a rejection (ADR-0008) — which also means a
 * failed thread is cached like any other answer, and retrying is
 * `revalidate(threadQuery.keyFor(id))` rather than calling again.
 */
export const threadQuery = query(
  async (id: string): Promise<Result<Thread, ApiError>> => {
    const [subject, context] = await Promise.all([
      fetchStatus(id),
      fetchContext(id),
    ]);
    if (!subject.ok) return subject;
    if (!context.ok) return context;
    return ok({ subject: subject.value, context: context.value });
  },
  "thread",
);

/** What the navigation that opened the thread decides about the page. */
export type ThreadArrival = {
  /**
   * Whether the page should scroll the subject into view on arrival, or leave
   * the offset to `<Router scrollRestoration>`.
   */
  readonly landOnSubject: boolean;
  /** Whether a history back leads anywhere inside the app. */
  readonly canGoBack: boolean;
};

/**
 * Warms the thread cache before the route renders, and reads the two things
 * about the navigation itself that only the router knows at this point.
 *
 * `intent` is how a browser traversal is told apart from a link tap. Scroll
 * restoration applies to traversals only, and it gives up the moment a scroll
 * it did not make arrives — so on a traversal the landing scroll would both
 * lose the restored offset and replace it with a different one. A first render
 * of the document ("initial") is the one arrival with nothing behind it in this
 * app's history, so that is where a back control has to become a link home.
 */
export const preloadThread: RoutePreloadFunc<ThreadArrival> = ({
  params,
  intent,
}) => {
  const { id } = params;
  if (id !== undefined) void threadQuery(id);
  return {
    landOnSubject: intent !== "native",
    canGoBack: intent !== "initial",
  };
};
