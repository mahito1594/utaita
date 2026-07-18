import DOMPurify from "dompurify";
import type { Emoji } from "./emoji";
import { segmentByShortcode } from "./emoji";

export type RenderContentOptions = {
  emojis: readonly Emoji[];
  /**
   * True when a quote mini-card is rendered alongside this body: the
   * server-appended `span.quote-inline` ("RE: <link>") duplicates the quoted
   * URL and is stripped. When no card is rendered the span stays as the
   * fallback link (ADR-0007).
   */
  hasQuoteCard: boolean;
};

/**
 * Turn `status.content` into a DOM fragment ready for insertion: sanitize,
 * replace `:shortcode:` text with emoji images, strip the quote-inline span
 * when a quote card is rendered, and send non-mention links to a new tab.
 */
export const renderContent = (
  html: string,
  options: RenderContentOptions,
): DocumentFragment => {
  // Default allowlist minus media/embedding tags: body-authored images are
  // disallowed because emoji <img> elements are inserted after sanitization,
  // and enumerating ALLOWED_TAGS would silently drop future scrubber output
  // (ADR-0013).
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "img",
      "picture",
      "video",
      "audio",
      // source/track are in the default allowlist even though their parents
      // are forbidden (found in review 2026-07-18); forbid the whole family.
      "source",
      "track",
      "iframe",
      "form",
      "input",
      "style",
    ],
    // The style *attribute* (as opposed to the <style> tag above) survives
    // the html profile and lets a remote post overlay the whole viewport,
    // e.g. `style="position:fixed;inset:0;z-index:999999"` (found in review
    // 2026-07-18).
    FORBID_ATTR: ["style"],
  });
  if (options.hasQuoteCard) {
    for (const span of fragment.querySelectorAll("span.quote-inline")) {
      span.remove();
    }
  }
  replaceShortcodes(fragment, options.emojis);
  decorateLinks(fragment);
  return fragment;
};

const emojiImg = (shortcode: string, url: string): HTMLImageElement => {
  const img = document.createElement("img");
  img.setAttribute("src", url);
  img.setAttribute("alt", `:${shortcode}:`);
  img.setAttribute("title", `:${shortcode}:`);
  img.setAttribute("class", "custom-emoji");
  img.setAttribute("loading", "lazy");
  return img;
};

const replaceShortcodes = (
  fragment: DocumentFragment,
  emojis: readonly Emoji[],
): void => {
  if (emojis.length === 0) return;
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text) textNodes.push(node);
  }
  for (const node of textNodes) {
    const text = node.textContent ?? "";
    if (!text.includes(":")) continue;
    // Verbatim contexts keep their literal colons.
    if (node.parentElement?.closest("code, pre")) continue;
    const segments = segmentByShortcode(text, emojis);
    if (!segments.some((s) => s.kind === "emoji")) continue;
    node.replaceWith(
      ...segments.map((s) =>
        s.kind === "text"
          ? document.createTextNode(s.text)
          : emojiImg(s.shortcode, s.url),
      ),
    );
  }
};

const decorateLinks = (fragment: DocumentFragment): void => {
  for (const anchor of fragment.querySelectorAll("a")) {
    // Mentions navigate in-app via the delegated click handler (ADR-0011);
    // everything else (external links, hashtags) opens in a new tab.
    if (anchor.classList.contains("mention")) continue;
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
};
