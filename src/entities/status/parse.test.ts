import { describe, expect, test } from "vitest";
import type { components } from "../../api/schema";
import { parseAttachmentExtras, parseEmojiReactions, parsePoll } from "./parse";

type Status = components["schemas"]["Status"];

describe("parseEmojiReactions", () => {
  test("recovers url for remote custom emoji and defaults for unicode", () => {
    // `url`/`account_ids` are absent from the generated type (spec lags the
    // wire) — assigning via a non-fresh variable skips excess-property checks
    // without an `as` assertion, mirroring how real responses arrive.
    const remote = {
      name: "neofox@remote.host",
      count: 2,
      me: false,
      url: "https://remote.host/emoji/neofox.png",
    };
    const unicode = { name: "😸", count: 3, me: true, url: null };
    const status: Status = {
      pleroma: { emoji_reactions: [remote, unicode] },
    };
    expect(parseEmojiReactions(status)).toEqual([
      {
        name: "neofox@remote.host",
        count: 2,
        me: false,
        url: "https://remote.host/emoji/neofox.png",
      },
      { name: "😸", count: 3, me: true, url: null },
    ]);
  });

  test("skips nameless entries and defaults count/me", () => {
    const status: Status = {
      pleroma: { emoji_reactions: [{}, { name: "🎉" }] },
    };
    expect(parseEmojiReactions(status)).toEqual([
      { name: "🎉", count: 0, me: false, url: null },
    ]);
  });

  test("missing pleroma or reactions yields an empty list", () => {
    expect(parseEmojiReactions({})).toEqual([]);
    expect(parseEmojiReactions({ pleroma: {} })).toEqual([]);
  });
});

describe("parseAttachmentExtras", () => {
  test("recovers blurhash and aspect ratio from unlisted fields", () => {
    const attachment = {
      id: "1",
      blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
      meta: { original: { width: 400, height: 300 } },
    };
    expect(parseAttachmentExtras(attachment)).toEqual({
      blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj",
      aspectRatio: 400 / 300,
    });
  });

  test("remote attachment without blurhash/meta gets nulls", () => {
    expect(parseAttachmentExtras({ id: "1" })).toEqual({
      blurhash: null,
      aspectRatio: null,
    });
  });

  test("degenerate meta shapes yield null ratio", () => {
    const nullMeta = { id: "1", meta: null };
    const emptyOriginal = { id: "1", meta: { original: {} } };
    const zeroHeight = {
      id: "1",
      meta: { original: { width: 100, height: 0 } },
    };
    expect(parseAttachmentExtras(nullMeta).aspectRatio).toBeNull();
    expect(parseAttachmentExtras(emptyOriginal).aspectRatio).toBeNull();
    expect(parseAttachmentExtras(zeroHeight).aspectRatio).toBeNull();
  });
});

describe("parsePoll", () => {
  test("authenticated poll with own_votes (unlisted in the spec)", () => {
    const poll = {
      options: [
        { title: "accept", votes_count: 6 },
        { title: "deny", votes_count: 4 },
      ],
      votes_count: 10,
      voters_count: null,
      multiple: false,
      expired: true,
      expires_at: "2026-07-01T00:00:00.000Z",
      voted: true,
      own_votes: [1],
      akkoma: { anonymous: true },
    };
    const parsed = parsePoll(poll);
    expect(parsed.options).toEqual([
      { title: "accept", votesCount: 6, ratio: 0.6 },
      { title: "deny", votesCount: 4, ratio: 0.4 },
    ]);
    expect(parsed.voted).toBe(true);
    expect(parsed.ownVotes.has(1)).toBe(true);
    expect(parsed.expired).toBe(true);
    expect(parsed.anonymous).toBe(true);
  });

  test("unauthenticated poll: voted/own_votes keys are absent entirely", () => {
    const parsed = parsePoll({
      options: [{ title: "a", votes_count: 1 }],
      votes_count: 1,
    });
    expect(parsed.voted).toBe(false);
    expect(parsed.ownVotes.size).toBe(0);
  });

  test("multiple-choice ratios divide by voters, not votes", () => {
    const parsed = parsePoll({
      options: [
        { title: "a", votes_count: 4 },
        { title: "b", votes_count: 2 },
      ],
      votes_count: 6,
      voters_count: 4,
      multiple: true,
    });
    expect(parsed.options.map((o) => o.ratio)).toEqual([1, 0.5]);
  });

  test("zero votes yields zero ratios, not NaN", () => {
    const parsed = parsePoll({
      options: [{ title: "a", votes_count: 0 }],
      votes_count: 0,
    });
    expect(parsed.options[0]?.ratio).toBe(0);
  });

  test("null voted (spec shape) is treated as not voted", () => {
    expect(parsePoll({ voted: null }).voted).toBe(false);
  });
});
