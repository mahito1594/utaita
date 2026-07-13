import { describe, expect, test } from "vitest";
import type { Emoji } from "./emoji";
import { segmentByShortcode } from "./emoji";

const neocat: Emoji = {
  shortcode: "neocat_think",
  url: "https://example.test/emoji/neocat_think.png",
  static_url: "https://example.test/emoji/neocat_think.png",
  visible_in_picker: false,
};

describe("segmentByShortcode", () => {
  test("replaces a known shortcode surrounded by text", () => {
    expect(segmentByShortcode("hi :neocat_think: bye", [neocat])).toEqual([
      { kind: "text", text: "hi " },
      { kind: "emoji", shortcode: "neocat_think", url: neocat.url },
      { kind: "text", text: " bye" },
    ]);
  });

  test("text consisting of a single shortcode", () => {
    expect(segmentByShortcode(":neocat_think:", [neocat])).toEqual([
      { kind: "emoji", shortcode: "neocat_think", url: neocat.url },
    ]);
  });

  test("unknown shortcodes stay literal text", () => {
    expect(segmentByShortcode("hello :missing: world", [neocat])).toEqual([
      { kind: "text", text: "hello :missing: world" },
    ]);
  });

  test("an unknown shortcode does not eat the colon of an adjacent known one", () => {
    expect(segmentByShortcode(":missing::neocat_think:", [neocat])).toEqual([
      { kind: "text", text: ":missing:" },
      { kind: "emoji", shortcode: "neocat_think", url: neocat.url },
    ]);
  });

  test("adjacent known shortcodes", () => {
    expect(
      segmentByShortcode(":neocat_think::neocat_think:", [neocat]),
    ).toEqual([
      { kind: "emoji", shortcode: "neocat_think", url: neocat.url },
      { kind: "emoji", shortcode: "neocat_think", url: neocat.url },
    ]);
  });

  test("empty emoji list passes text through", () => {
    expect(segmentByShortcode("plain :text:", [])).toEqual([
      { kind: "text", text: "plain :text:" },
    ]);
  });

  test("empty text yields no segments", () => {
    expect(segmentByShortcode("", [neocat])).toEqual([]);
  });

  test("emoji entries without a url are skipped", () => {
    const broken: Emoji = { shortcode: "broken", visible_in_picker: false };
    expect(segmentByShortcode(":broken:", [broken])).toEqual([
      { kind: "text", text: ":broken:" },
    ]);
  });

  test("shortcodes with regex metacharacters are matched literally", () => {
    const plus: Emoji = {
      shortcode: "a+b",
      url: "https://example.test/emoji/aplusb.png",
    };
    expect(segmentByShortcode("x :a+b: y", [plus])).toEqual([
      { kind: "text", text: "x " },
      { kind: "emoji", shortcode: "a+b", url: plus.url },
      { kind: "text", text: " y" },
    ]);
  });
});
