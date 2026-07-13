import { describe, expect, test } from "vitest";
import { relativeTime } from "./time";

const now = new Date("2026-07-13T12:00:00.000Z");

describe("relativeTime", () => {
  test("under a minute is now", () => {
    expect(relativeTime("2026-07-13T11:59:30.000Z", now)).toBe("now");
  });

  test("minutes", () => {
    expect(relativeTime("2026-07-13T11:55:00.000Z", now)).toBe("5m");
    expect(relativeTime("2026-07-13T11:00:01.000Z", now)).toBe("59m");
  });

  test("hours", () => {
    expect(relativeTime("2026-07-13T09:00:00.000Z", now)).toBe("3h");
    expect(relativeTime("2026-07-12T12:00:01.000Z", now)).toBe("23h");
  });

  test("days up to a week", () => {
    expect(relativeTime("2026-07-11T11:00:00.000Z", now)).toBe("2d");
    expect(relativeTime("2026-07-06T12:00:01.000Z", now)).toBe("6d");
  });

  test("past a week becomes a date, with the year when it differs", () => {
    expect(relativeTime("2026-07-01T00:00:00.000Z", now)).toBe("Jul 1");
    expect(relativeTime("2025-12-31T00:00:00.000Z", now)).toBe("Dec 31, 2025");
  });

  test("future dates clamp to now (instance clock skew)", () => {
    expect(relativeTime("2026-07-13T12:00:30.000Z", now)).toBe("now");
    expect(relativeTime("2026-07-14T12:00:00.000Z", now)).toBe("now");
  });

  test("garbage input renders nothing rather than NaN", () => {
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});
