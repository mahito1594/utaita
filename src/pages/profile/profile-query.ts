import { query, type RoutePreloadFunc } from "@solidjs/router";
import { fetchAccount, fetchPinnedPosts } from "./profile-api";

/**
 * The account a profile URL names, cached by the router's data layer.
 *
 * The failure is a value, not a rejection (ADR-0008) — which also means a
 * failed account is cached like any other answer, and retrying is
 * `revalidate(profileQuery.keyFor(acct))` rather than calling again.
 *
 * The posts under the header are not part of this: they are paged from a
 * mounted store (cursor-list-store.ts), which a cache entry the router may
 * revalidate on its own schedule cannot hold.
 */
export const profileQuery = query(fetchAccount, "profile");

/**
 * Warms the account cache before the route renders, under the key the page
 * reads (ProfilePage.tsx): both take the router's already-decoded `:acct`.
 */
export const preloadProfile: RoutePreloadFunc<void> = ({ params }) => {
  const { acct } = params;
  if (acct !== undefined) void profileQuery(acct);
};

/**
 * The pinned strip's statuses, cached by the router's data layer like the
 * account. Retrying a failure is `revalidate(pinnedQuery.keyFor(acct))`.
 *
 * Not part of `preloadProfile`: only the Posts tab draws the strip
 * (profile-tabs.ts), and warming it for the others would be a request nothing
 * reads.
 */
export const pinnedQuery = query(fetchPinnedPosts, "profile-pinned");
