import type { components } from "../../api/schema";

export type Mention = NonNullable<
  components["schemas"]["Status"]["mentions"]
>[number];

// Single source of the profile URL shape. `/@:acct` (the Mastodon-web look)
// is not expressible in solid-router — a segment is dynamic only when it
// starts with `:`. Not /users/ either: Akkoma owns that namespace for its
// actors (feed, static-fe `media` / `with_replies`, AP `followers` /
// `following`), and a dotted remote acct in the last segment is read as a
// Phoenix `_format`; the instance would answer those URLs itself instead of
// serving the app. /accounts/ is unclaimed, so every path under it falls
// through to index.html (measured on Akkoma 3.20; the dev proxy hides this).
// `acct` may contain `@` and dots; both are valid raw path characters.
export const profilePath = (acct: string): string => `/accounts/${acct}`;

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
