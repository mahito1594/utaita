import { describe, expect, test } from "vitest";
import { preciseTime, relativeTime } from "./time";

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

// Both the formatter and the year comparison work in the environment's time
// zone, so the inputs here are written as wall-clock moments and converted:
// the expected strings then hold wherever the suite runs.
const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string => new Date(year, month - 1, day, hour, minute).toISOString();

describe("preciseTime", () => {
  // Only its year is read; the distance to the post never enters the result.
  const nowIn2026 = new Date(at(2026, 7, 13, 12, 0));

  test("renders the date and the time of day", () => {
    expect(preciseTime(at(2026, 7, 5, 14, 32), nowIn2026)).toBe("Jul 5, 14:32");
  });

  test("keeps a 24-hour clock, zero-padded", () => {
    expect(preciseTime(at(2026, 7, 5, 9, 5), nowIn2026)).toBe("Jul 5, 09:05");
    expect(preciseTime(at(2026, 7, 5, 0, 0), nowIn2026)).toBe("Jul 5, 00:00");
    expect(preciseTime(at(2026, 7, 5, 23, 59), nowIn2026)).toBe("Jul 5, 23:59");
  });

  test("a moment ago still reads as a clock time, not as a distance", () => {
    expect(preciseTime(at(2026, 7, 13, 11, 59), nowIn2026)).toBe(
      "Jul 13, 11:59",
    );
  });

  test("carries the year when it differs", () => {
    expect(preciseTime(at(2025, 12, 31, 23, 59), nowIn2026)).toBe(
      "Dec 31, 2025, 23:59",
    );
    expect(preciseTime(at(2027, 1, 1, 0, 1), nowIn2026)).toBe(
      "Jan 1, 2027, 00:01",
    );
  });

  test("garbage input renders nothing rather than NaN", () => {
    expect(preciseTime("not-a-date", nowIn2026)).toBe("");
  });
});
