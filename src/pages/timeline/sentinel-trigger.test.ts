import { describe, expect, test } from "vitest";
import { shouldTriggerLoadOlder } from "./sentinel-trigger";

describe("shouldTriggerLoadOlder", () => {
  test("requests the next page when idle and not exhausted", () => {
    expect(shouldTriggerLoadOlder({ exhausted: false, loading: false })).toBe(
      true,
    );
  });

  test("does not request while a load is already in flight", () => {
    expect(shouldTriggerLoadOlder({ exhausted: false, loading: true })).toBe(
      false,
    );
  });

  test("does not request once exhausted", () => {
    expect(shouldTriggerLoadOlder({ exhausted: true, loading: false })).toBe(
      false,
    );
  });

  test("does not request when both exhausted and loading", () => {
    expect(shouldTriggerLoadOlder({ exhausted: true, loading: true })).toBe(
      false,
    );
  });
});
