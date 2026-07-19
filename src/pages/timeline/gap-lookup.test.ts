import { describe, expect, test } from "vitest";
import type { components } from "../../api/schema";
import { gapBoundariesByTailId } from "./gap-lookup";
import type { Segment } from "./segments";

type Status = components["schemas"]["Status"];

const status = (id: string): Status => ({ id });
const segment = (...idList: string[]): Segment => ({
  statuses: idList.map(status),
});

describe("gapBoundariesByTailId", () => {
  test("an empty segment list has no boundaries", () => {
    expect(gapBoundariesByTailId([])).toEqual(new Map());
  });

  test("a single segment has no gap below it", () => {
    const segments = [segment("s10", "s09")];
    expect(gapBoundariesByTailId(segments)).toEqual(new Map());
  });

  test("maps every non-last segment's tail id to its index", () => {
    const segments = [
      segment("s30", "s29"),
      segment("s20", "s19"),
      segment("s10", "s09"),
    ];
    expect(gapBoundariesByTailId(segments)).toEqual(
      new Map([
        ["s29", 0],
        ["s19", 1],
      ]),
    );
  });

  test("the last segment's tail id is never a boundary, even alongside others", () => {
    const segments = [segment("s20", "s19"), segment("s10", "s09")];
    const map = gapBoundariesByTailId(segments);
    expect(map.has("s09")).toBe(false);
    expect(map.get("s19")).toBe(0);
  });
});
