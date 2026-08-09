// API-provided URLs (link preview cards, unknown-type attachment fallbacks)
// bypass the DOMPurify pipeline entirely — they are read from JSON fields,
// not sanitized HTML — so this is the only scheme check standing between
// them and an anchor's href. Parse once here; a non-null result is the only
// value callers may render as a link.

/**
 * Resolve an API-provided URL to a safe external href, or null when it
 * isn't one. Only `http:`/`https:` pass; everything else (`javascript:`,
 * `data:`, malformed input, relative paths with no base here) is rejected.
 */
export const safeExternalHref = (
  url: string | undefined | null,
): string | null => {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? url
    : null;
};

// Single source of the thread URL shape, alongside `profilePath` (mention.ts):
// a status opened in-app is its conversation, so the route that draws the
// thread is the status's own permalink.
export const statusPath = (id: string): string => `/statuses/${id}`;
