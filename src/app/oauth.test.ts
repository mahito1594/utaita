// Pure-logic tests: no DOM, no mocks (ADR-0009).
import { describe, expect, test } from "vitest";
import {
  buildAuthorizeUrl,
  generateState,
  parseCallbackParams,
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
