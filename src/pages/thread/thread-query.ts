import { query, type RoutePreloadFunc } from "@solidjs/router";
import type { ApiError } from "../../api/client";
import { ok, type Result } from "../../api/result";
import { requestThread } from "../../entities/status/open-thread";
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

/** What the navigation that first landed on the route decides about the page. */
export type ThreadArrival = {
  /** Whether a history back leads anywhere inside the app. */
  readonly canGoBack: boolean;
};

/**
 * Warms the thread cache before the route renders, and reads what only the
 * router knows at this point about the navigation that caused it.
 *
 * `intent` is how a browser traversal is told apart from a link tap. Scroll
 * restoration applies to traversals only, and it gives up the moment a scroll
 * it did not make arrives — so on a traversal, scrolling the subject into view
 * would both lose the restored offset and replace it with a different one. A
 * preload is not an arrival at all; everything else is the reader asking for
 * this post, including a first render of the document ("initial"), which is
 * also the one arrival with nothing behind it in this app's history and so the
 * one where a back control has to become a link home.
 *
 * This runs once per route context, which is not once per arrival: see
 * `takeThreadRequest` (open-thread.ts) for the half of the story that a change
 * of `:id` alone falls into.
 */
export const preloadThread: RoutePreloadFunc<ThreadArrival> = ({
  params,
  intent,
}) => {
  const { id } = params;
  if (id !== undefined) {
    void threadQuery(id);
    if (intent === "navigate" || intent === "initial") requestThread(id);
  }
  return { canGoBack: intent !== "initial" };
};
