import { describe, expect, test } from "vitest";
import { overlayStateFor, parseOverlayState } from "./overlay";

describe("overlay state", () => {
  test("round-trips through the parser", () => {
    expect(parseOverlayState(overlayStateFor("110001", 2))).toEqual({
      overlayStatusId: "110001",
      overlayIndex: 2,
    });
  });

  test("rejects non-objects and null", () => {
    expect(parseOverlayState(null)).toBeNull();
    expect(parseOverlayState(undefined)).toBeNull();
    expect(parseOverlayState("open")).toBeNull();
    expect(parseOverlayState(7)).toBeNull();
  });

  test("rejects missing or malformed fields", () => {
    expect(parseOverlayState({})).toBeNull();
    expect(parseOverlayState({ overlayStatusId: "1" })).toBeNull();
    expect(
      parseOverlayState({ overlayStatusId: 1, overlayIndex: 0 }),
    ).toBeNull();
    expect(
      parseOverlayState({ overlayStatusId: "1", overlayIndex: -1 }),
    ).toBeNull();
    expect(
      parseOverlayState({ overlayStatusId: "1", overlayIndex: 1.5 }),
    ).toBeNull();
  });

  test("ignores unrelated state shapes (e.g. scroll restoration)", () => {
    expect(parseOverlayState({ scrollY: 100 })).toBeNull();
  });
});
