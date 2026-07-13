import { describe, expect, test } from "vitest";
import type { Mention } from "./mention";
import { mentionPath, profilePath } from "./mention";

const alice: Mention = {
  id: "1",
  acct: "alice@remote.host",
  username: "alice",
  url: "https://remote.host/users/alice",
};

describe("profilePath", () => {
  test("builds the in-app profile path from acct", () => {
    expect(profilePath("alice@remote.host")).toBe("/users/alice@remote.host");
    expect(profilePath("bob")).toBe("/users/bob");
  });
});

describe("mentionPath", () => {
  test("resolves an exact href match to a profile path", () => {
    expect(mentionPath("https://remote.host/users/alice", [alice])).toBe(
      "/users/alice@remote.host",
    );
  });

  test("returns null when the href matches no mention", () => {
    expect(mentionPath("https://elsewhere.test/users/eve", [alice])).toBeNull();
    expect(mentionPath("https://remote.host/users/alice", [])).toBeNull();
  });

  test("ignores mentions without url or acct", () => {
    const incomplete: Mention = { id: "2", username: "ghost" };
    expect(
      mentionPath("https://remote.host/users/alice", [incomplete]),
    ).toBeNull();
  });
});
