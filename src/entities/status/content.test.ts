// @vitest-environment jsdom
// jsdom, not happy-dom: DOMPurify silently degrades to a no-op under
// happy-dom (isSupported reports true but script/onclick survive), verified
// 2026-07-13 with happy-dom 20.10.6 + dompurify 3.4.12.
import { describe, expect, test } from "vitest";
import { renderContent } from "./content";
import type { Emoji } from "./emoji";

const neocat: Emoji = {
  shortcode: "neocat_think",
  url: "https://example.test/emoji/neocat_think.png",
};

const render = (
  html: string,
  options?: { emojis?: Emoji[]; hasQuoteCard?: boolean },
) => {
  const div = document.createElement("div");
  div.append(
    renderContent(html, {
      emojis: options?.emojis ?? [],
      hasQuoteCard: options?.hasQuoteCard ?? false,
    }),
  );
  return div;
};

describe("sanitization", () => {
  test("drops script elements and event handler attributes", () => {
    const div = render(
      '<p>hi<script>alert(1)</script><a href="https://x.test" onclick="evil()">l</a></p>',
    );
    expect(div.querySelector("script")).toBeNull();
    expect(div.querySelector("a")?.getAttribute("onclick")).toBeNull();
    expect(div.textContent).toContain("hi");
  });

  test("keeps basic formatting tags pleroma-fe drops", () => {
    const div = render(
      "<p><small>s</small><sub>b</sub><sup>p</sup><ruby>ru<rt>rt</rt></ruby><blockquote>q</blockquote><code>c</code></p>",
    );
    for (const tag of ["small", "sub", "sup", "ruby", "blockquote", "code"]) {
      expect(div.querySelector(tag), tag).not.toBeNull();
    }
  });

  test("drops body-authored media tags but keeps their text", () => {
    const div = render(
      '<p><img src="https://x.test/a.png">text<iframe src="x"></iframe></p>',
    );
    expect(div.querySelector("img")).toBeNull();
    expect(div.querySelector("iframe")).toBeNull();
    expect(div.textContent).toBe("text");
  });

  test("drops the whole embedding-tag family", () => {
    // object/embed are dropped by the html profile itself — this pins that
    // premise across DOMPurify upgrades. source/track survived the profile
    // (review 2026-07-18) and are covered by FORBID_TAGS instead.
    const div = render(
      '<p><object data="https://x.test/a"></object><embed src="https://x.test/b">' +
        '<source src="https://x.test/c"><track src="https://x.test/d">text</p>',
    );
    for (const tag of ["object", "embed", "source", "track"]) {
      expect(div.querySelector(tag), tag).toBeNull();
    }
    expect(div.textContent).toBe("text");
  });

  test("javascript: hrefs are stripped", () => {
    const div = render('<a href="javascript:alert(1)">x</a>');
    expect(div.querySelector("a")?.getAttribute("href")).toBeNull();
  });

  test("the style attribute is stripped but the element survives", () => {
    // A remote post could otherwise overlay the whole viewport with a link
    // (found in review 2026-07-18).
    const div = render(
      '<a href="https://x.test" style="position:fixed;inset:0;z-index:999999">x</a>',
    );
    expect(div.querySelector("a")?.getAttribute("style")).toBeNull();
    expect(div.querySelector("a")?.getAttribute("href")).toBe("https://x.test");
  });
});

describe("custom emoji replacement", () => {
  test("replaces :shortcode: text with an img", () => {
    const div = render("<p>think :neocat_think: hard</p>", {
      emojis: [neocat],
    });
    const img = div.querySelector("img.custom-emoji");
    expect(img?.getAttribute("src")).toBe(neocat.url);
    expect(img?.getAttribute("alt")).toBe(":neocat_think:");
    expect(div.textContent).toBe("think  hard");
  });

  test("does not replace inside code or pre", () => {
    const div = render(
      "<p><code>:neocat_think:</code><pre>:neocat_think:</pre>:neocat_think:</p>",
      { emojis: [neocat] },
    );
    expect(div.querySelectorAll("img.custom-emoji")).toHaveLength(1);
    expect(div.querySelector("code")?.textContent).toBe(":neocat_think:");
    expect(div.querySelector("pre")?.textContent).toBe(":neocat_think:");
  });

  test("unknown shortcodes stay literal", () => {
    const div = render("<p>:missing:</p>", { emojis: [neocat] });
    expect(div.querySelector("img")).toBeNull();
    expect(div.textContent).toBe(":missing:");
  });
});

describe("quote-inline handling", () => {
  const quoted =
    '<p>body<span class="quote-inline"><br>RE: <a href="https://x.test/objects/1">https://x.test/objects/1</a></span></p>';

  test("strips span.quote-inline when a quote card is rendered", () => {
    const div = render(quoted, { hasQuoteCard: true });
    expect(div.querySelector("span.quote-inline")).toBeNull();
    expect(div.textContent).toBe("body");
  });

  test("keeps the RE: link when no quote card is rendered", () => {
    const div = render(quoted, { hasQuoteCard: false });
    expect(div.querySelector("span.quote-inline")).not.toBeNull();
    expect(div.querySelector("span.quote-inline a")?.getAttribute("href")).toBe(
      "https://x.test/objects/1",
    );
  });
});

describe("link decoration", () => {
  test("non-mention links open in a new tab", () => {
    const div = render('<a href="https://elsewhere.test">x</a>');
    const a = div.querySelector("a");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("mention links are left for in-app navigation", () => {
    const div = render(
      '<a class="u-url mention" href="https://x.test/users/alice">@alice</a>',
    );
    const a = div.querySelector("a");
    expect(a?.getAttribute("target")).toBeNull();
    expect(a?.classList.contains("mention")).toBe(true);
  });
});
