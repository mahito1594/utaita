import { describe, expect, test } from "vitest";
import { safeExternalHref } from "./url";

describe("safeExternalHref", () => {
  test("passes through http and https URLs unchanged", () => {
    expect(safeExternalHref("https://example.test/path")).toBe(
      "https://example.test/path",
    );
    expect(safeExternalHref("http://example.test/path")).toBe(
      "http://example.test/path",
    );
  });

  test("rejects non-http(s) schemes", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,<script>alert(1)</script>")).toBe(
      null,
    );
    expect(safeExternalHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeExternalHref("file:///etc/passwd")).toBeNull();
  });

  test("rejects malformed or relative input", () => {
    expect(safeExternalHref("not a url")).toBeNull();
    expect(safeExternalHref("")).toBeNull();
    expect(safeExternalHref("/relative/path")).toBeNull();
  });

  test("rejects undefined and null", () => {
    expect(safeExternalHref(undefined)).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
  });
});
