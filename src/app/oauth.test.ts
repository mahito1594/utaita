// Pure-logic tests: no DOM, no mocks (ADR-0009).
import { describe, expect, test } from "vitest";
import {
  buildAuthorizeUrl,
  generateState,
  parseCallbackParams,
  parseReturnPath,
  stateMatches,
} from "./oauth";

describe("buildAuthorizeUrl", () => {
  test("carries the code flow params and the phase scope", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid-1",
      redirectUri: "http://localhost:5173/oauth-callback",
      state: "nonce-1",
    });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/oauth/authorize?")).toBe(true);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe("cid-1");
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:5173/oauth-callback",
    );
    expect(params.get("scope")).toBe("read");
    expect(params.get("state")).toBe("nonce-1");
  });
});

describe("parseCallbackParams", () => {
  test("extracts code and state", () => {
    expect(parseCallbackParams("?code=abc&state=xyz")).toEqual({
      kind: "code",
      code: "abc",
      state: "xyz",
    });
  });

  test("tolerates a missing state (mismatch is decided later)", () => {
    expect(parseCallbackParams("?code=abc")).toEqual({
      kind: "code",
      code: "abc",
      state: undefined,
    });
  });

  test("reports an OAuth error redirect as denied", () => {
    expect(parseCallbackParams("?error=access_denied")).toEqual({
      kind: "denied",
      error: "access_denied",
    });
  });

  test("error wins over code if both appear", () => {
    expect(parseCallbackParams("?code=abc&error=access_denied")).toEqual({
      kind: "denied",
      error: "access_denied",
    });
  });

  test("no params at all is invalid", () => {
    expect(parseCallbackParams("")).toEqual({ kind: "invalid" });
  });
});

describe("generateState", () => {
  test("produces distinct 32-char hex nonces", () => {
    const a = generateState();
    const b = generateState();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe("parseReturnPath", () => {
  test("keeps an in-app path whole, query and fragment included", () => {
    expect(parseReturnPath("/statuses/110000000000000001")).toBe(
      "/statuses/110000000000000001",
    );
    expect(parseReturnPath("/users/alice@fixture.example")).toBe(
      "/users/alice@fixture.example",
    );
    expect(parseReturnPath("/local?a=b#c")).toBe("/local?a=b#c");
    expect(parseReturnPath("/")).toBe("/");
  });

  test("nothing stored is no destination", () => {
    expect(parseReturnPath(null)).toBeUndefined();
  });

  test("rejects an absolute URL, whatever its scheme", () => {
    expect(parseReturnPath("https://evil.example/statuses/1")).toBeUndefined();
    expect(parseReturnPath("http://evil.example/")).toBeUndefined();
    expect(parseReturnPath("javascript:alert(1)")).toBeUndefined();
    expect(parseReturnPath("data:text/html,<h1>x</h1>")).toBeUndefined();
  });

  test("rejects a protocol-relative path in every spelling", () => {
    expect(parseReturnPath("//evil.example")).toBeUndefined();
    expect(parseReturnPath("///evil.example")).toBeUndefined();
    // Backslashes: the URL parser folds them into slashes.
    expect(parseReturnPath("/\\evil.example")).toBeUndefined();
    expect(parseReturnPath("\\\\evil.example")).toBeUndefined();
    // Tabs and newlines: the URL parser strips them, so a path that looks
    // in-app before parsing turns protocol-relative after it.
    expect(parseReturnPath("/\t/evil.example")).toBeUndefined();
    expect(parseReturnPath("/\n/evil.example")).toBeUndefined();
    // Leading whitespace is trimmed by the same parser.
    expect(parseReturnPath("  //evil.example")).toBeUndefined();
    // Same-origin as parsed, but the resulting path is protocol-relative
    // again once it is used as one.
    expect(parseReturnPath("/..//evil.example")).toBeUndefined();
  });

  test("rejects the callback path itself, spent code and all", () => {
    expect(parseReturnPath("/oauth-callback")).toBeUndefined();
    expect(parseReturnPath("/oauth-callback?code=c&state=s")).toBeUndefined();
  });

  test("a relative path cannot escape the app either", () => {
    expect(parseReturnPath("statuses/1")).toBe("/statuses/1");
    expect(parseReturnPath("../../evil.example")).toBe("/evil.example");
    expect(parseReturnPath("")).toBe("/");
  });
});

describe("stateMatches", () => {
  test("equal values match", () => {
    expect(stateMatches("n1", "n1")).toBe(true);
  });

  test("different values do not match", () => {
    expect(stateMatches("n1", "n2")).toBe(false);
  });

  test("a missing value on either side never passes", () => {
    expect(stateMatches(undefined, "n1")).toBe(false);
    expect(stateMatches("n1", undefined)).toBe(false);
    expect(stateMatches(undefined, undefined)).toBe(false);
  });
});
