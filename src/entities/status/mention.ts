import type { components } from "../../api/schema";

export type Mention = NonNullable<
  components["schemas"]["Status"]["mentions"]
>[number];

// Single source of the profile URL shape. `/@:acct` (the Mastodon-web look)
// is not expressible in solid-router — a segment is dynamic only when it
// starts with `:` — so profiles live under /users/. `acct` may contain
// `@` and dots; both are valid raw path characters.
export const profilePath = (acct: string): string => `/users/${acct}`;

/**
 * The `:acct` a route matched, as the acct it names. solid-router hands the
 * URL segment over undecoded (dist/utils.js, `createMatcher`), and
 * openapi-fetch percent-encodes path params on the way out, so a URL written
 * as `/users/alice%40remote.example` — equivalent to the raw `@` form the app
 * links to — would otherwise ask the API for `alice%2540remote.example`.
 * A malformed escape is left as written; the API's 404 then says what it is.
 *
 * Known limit: `<A>` decides `aria-current` by comparing its raw href with
 * `decodeURI(location.pathname)`, and `decodeURI` leaves `%40` encoded, so on
 * a URL that arrived in that spelling no profile tab is marked current until
 * the first tab click navigates to the raw form the tabs link to.
 */
export const acctFromPath = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Resolve a mention anchor's href to an in-app profile path by exact match
 * against the status's own mentions. Null means "not one of this status's
 * mentions" — the caller falls back to opening the href externally.
 */
export const mentionPath = (
  href: string,
  mentions: readonly Mention[],
): string | null => {
  for (const mention of mentions) {
    if (mention.url !== undefined && mention.url === href && mention.acct) {
      return profilePath(mention.acct);
    }
  }
  return null;
};
