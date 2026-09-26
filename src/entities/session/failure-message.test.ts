// Pure-logic tests: no DOM, no mocks (ADR-0009).
import { describe, expect, test } from "vitest";
import { failureMessage } from "./failure-message";

describe("failureMessage", () => {
  test("a network failure points at the network", () => {
    expect(
      failureMessage(
        { kind: "network", cause: new TypeError() },
        "this account",
        true,
      ),
    ).toBe("Couldn't load this account — check your network.");
  });

  test.each([401, 403])("http %i asks for a sign-in", (status) => {
    expect(
      failureMessage(
        { kind: "http", status, message: "nope" },
        "older posts",
        false,
      ),
    ).toBe("Sign-in required to view older posts.");
  });

  test("http 404 while signed in says the subject is not on this instance", () => {
    expect(
      failureMessage(
        { kind: "http", status: 404, message: undefined },
        "this post",
        true,
      ),
    ).toBe("Couldn't find this post on this instance.");
  });

  test("http 404 while anonymous also suggests a sign-in", () => {
    expect(
      failureMessage(
        { kind: "http", status: 404, message: undefined },
        "this post",
        false,
      ),
    ).toBe(
      "Couldn't find this post on this instance, or it needs a sign-in to see.",
    );
  });

  test("any other http status carries the status and the instance message", () => {
    expect(
      failureMessage(
        { kind: "http", status: 500, message: "Internal server error" },
        "this timeline",
        true,
      ),
    ).toBe("Couldn't load this timeline (500: Internal server error).");
  });

  test("an http error without a message carries the status alone", () => {
    expect(
      failureMessage(
        { kind: "http", status: 502, message: undefined },
        "new replies",
        false,
      ),
    ).toBe("Couldn't load new replies (502).");
  });
});
