import { query, type RoutePreloadFunc } from "@solidjs/router";
import { fetchAccount } from "./profile-api";

/**
 * The account a profile URL names, cached by the router's data layer.
 *
 * The failure is a value, not a rejection (ADR-0008) — which also means a
 * failed account is cached like any other answer, and retrying is
 * `revalidate(profileQuery.keyFor(acct))` rather than calling again.
 *
 * The posts under the header are not part of this: they are paged from a
 * mounted store (profile-posts-store.ts), which a cache entry the router may
 * revalidate on its own schedule cannot hold.
 */
export const profileQuery = query(fetchAccount, "profile");

/** Warms the account cache before the route renders. */
export const preloadProfile: RoutePreloadFunc<void> = ({ params }) => {
  const { acct } = params;
  if (acct !== undefined) void profileQuery(acct);
};
