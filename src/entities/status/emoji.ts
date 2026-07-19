import type { components } from "../../api/schema";

export type Emoji = components["schemas"]["Emoji"];

export type EmojiSegment =
  | { kind: "text"; text: string }
  | { kind: "emoji"; shortcode: string; url: string };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toShortcodeUrlMap = (emojis: readonly Emoji[]): Map<string, string> => {
  const byShortcode = new Map<string, string>();
  for (const emoji of emojis) {
    if (emoji.shortcode && emoji.url)
      byShortcode.set(emoji.shortcode, emoji.url);
  }
  return byShortcode;
};

/**
 * Split text into literal-text and custom-emoji segments. Only shortcodes
 * present in `emojis` (with a usable url) match; unknown `:words:` stay text,
 * so a dynamic pattern is built from the known shortcodes instead of a
 * generic `:(\w+):` scan — a generic scan would consume the opening colon of
 * an adjacent known shortcode (`:unknown::known:`).
 */
export const segmentByShortcode = (
  text: string,
  emojis: readonly Emoji[],
): EmojiSegment[] => {
  const byShortcode = toShortcodeUrlMap(emojis);
  if (text === "" || byShortcode.size === 0) {
    return text === "" ? [] : [{ kind: "text", text }];
  }

  const pattern = new RegExp(
    `:(${[...byShortcode.keys()].map(escapeRegExp).join("|")}):`,
    "g",
  );
  const segments: EmojiSegment[] = [];
  let consumed = 0;
  for (const match of text.matchAll(pattern)) {
    const shortcode = match[1];
    const url =
      shortcode === undefined ? undefined : byShortcode.get(shortcode);
    if (shortcode === undefined || url === undefined) continue;
    if (match.index > consumed) {
      segments.push({ kind: "text", text: text.slice(consumed, match.index) });
    }
    segments.push({ kind: "emoji", shortcode, url });
    consumed = match.index + match[0].length;
  }
  if (consumed < text.length) {
    segments.push({ kind: "text", text: text.slice(consumed) });
  }
  return segments;
};
