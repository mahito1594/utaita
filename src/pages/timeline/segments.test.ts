import { describe, expect, test } from "vitest";
import type { components } from "../../api/schema";
import { appendOlder, applyRefresh, type Segment } from "./segments";

type Status = components["schemas"]["Status"];

// Only `id` matters to the merge logic under test; every other field is
// irrelevant payload the pure functions never look at.
const status = (id: string): Status => ({ id });
const ids = (statuses: readonly Status[]): string[] =>
  statuses.map((s) => s.id ?? "");
const segment = (...idList: string[]): Segment => ({
  statuses: idList.map(status),
});

describe("appendOlder", () => {
  test("extends the tail of the last segment with an older page", () => {
    const segments = [segment("s10", "s09")];
    const result = appendOlder(segments, 0, [status("s08"), status("s07")]);
    expect(result).toHaveLength(1);
    expect(ids(result[0]?.statuses ?? [])).toEqual([
      "s10",
      "s09",
      "s08",
      "s07",
    ]);
  });

  test("dedupes a page that repeats statuses already in the target segment", () => {
    const segments = [segment("s10", "s09")];
    // A retried fetch could hand back an already-known status alongside new
    // ones; only the new ones should be appended.
    const result = appendOlder(segments, 0, [status("s09"), status("s08")]);
    expect(ids(result[0]?.statuses ?? [])).toEqual(["s10", "s09", "s08"]);
  });

  test("an empty page is a no-op", () => {
    const segments = [segment("s10", "s09")];
    const result = appendOlder(segments, 0, []);
    expect(result).toEqual(segments);
  });

  test("an out-of-range segment index is a no-op", () => {
    const result = appendOlder([], 0, [status("s01")]);
    expect(result).toEqual([]);
  });

  test("merges with the following segment once the page reaches it (gap fill)", () => {
    // Two segments with a gap between s07 and s05: filling the gap walks
    // from s07 down and discovers s05 already belongs to the next segment.
    const segments = [segment("s10", "s09", "s07"), segment("s05", "s04")];
    const result = appendOlder(segments, 0, [status("s06"), status("s05")]);
    expect(result).toHaveLength(1);
    expect(ids(result[0]?.statuses ?? [])).toEqual([
      "s10",
      "s09",
      "s07",
      "s06",
      "s05",
      "s04",
    ]);
  });

  test("a fully-overlapping page collapses without duplicating the next segment", () => {
    // The entire page turns out to already be the next segment's content —
    // there was never a real gap.
    const segments = [segment("s10", "s09"), segment("s07", "s06")];
    const result = appendOlder(segments, 0, [status("s07"), status("s06")]);
    expect(result).toHaveLength(1);
    expect(ids(result[0]?.statuses ?? [])).toEqual([
      "s10",
      "s09",
      "s07",
      "s06",
    ]);
  });

  test("closing one gap among several leaves the other segments untouched", () => {
    const segments = [
      segment("s30", "s29"),
      segment("s20", "s19"),
      segment("s10", "s09"),
    ];
    const result = appendOlder(segments, 1, [status("s11"), status("s10")]);
    expect(result).toHaveLength(2);
    expect(ids(result[0]?.statuses ?? [])).toEqual(["s30", "s29"]);
    expect(ids(result[1]?.statuses ?? [])).toEqual([
      "s20",
      "s19",
      "s11",
      "s10",
      "s09",
    ]);
  });
});

describe("applyRefresh", () => {
  test("first load into an empty store adopts the page as the sole segment", () => {
    const result = applyRefresh([], [status("s10"), status("s09")], false);
    expect(result).toHaveLength(1);
    expect(ids(result[0]?.statuses ?? [])).toEqual(["s10", "s09"]);
  });

  test("an empty page is a no-op", () => {
    const segments = [segment("s10", "s09")];
    expect(applyRefresh(segments, [], false)).toEqual(segments);
    expect(applyRefresh(segments, [], true)).toEqual(segments);
  });

  test("a contiguous page (mayHaveGap=false) merges into the head segment", () => {
    const segments = [segment("s10", "s09")];
    const result = applyRefresh(
      segments,
      [status("s12"), status("s11")],
      false,
    );
    expect(result).toHaveLength(1);
    expect(ids(result[0]?.statuses ?? [])).toEqual([
      "s12",
      "s11",
      "s10",
      "s09",
    ]);
  });

  test("dedupes a contiguous page that repeats a status already at the head", () => {
    const segments = [segment("s10", "s09")];
    const result = applyRefresh(
      segments,
      [status("s11"), status("s10")],
      false,
    );
    expect(ids(result[0]?.statuses ?? [])).toEqual(["s11", "s10", "s09"]);
  });

  test("a full page (mayHaveGap=true) is pushed as a new head, not merged", () => {
    const segments = [segment("s10", "s09")];
    const result = applyRefresh(
      segments,
      [status("s14"), status("s13"), status("s12"), status("s11")],
      true,
    );
    expect(result).toHaveLength(2);
    expect(ids(result[0]?.statuses ?? [])).toEqual([
      "s14",
      "s13",
      "s12",
      "s11",
    ]);
    expect(ids(result[1]?.statuses ?? [])).toEqual(["s10", "s09"]);
  });

  test("a gap opened by a full-page refresh self-heals once appendOlder proves contiguity", () => {
    const original = [segment("s10", "s09")];
    // Refresh returns a full page: length alone can't rule out a gap, so it
    // is pushed as its own segment above the old head.
    const afterRefresh = applyRefresh(
      original,
      [status("s14"), status("s13"), status("s12"), status("s11")],
      true,
    );
    expect(afterRefresh).toHaveLength(2);

    // Filling "the gap" walks older from the new head and immediately meets
    // the old head's newest status: there was no gap after all, and the
    // store ends up identical to a direct contiguous merge.
    const healed = appendOlder(afterRefresh, 0, [status("s10")]);
    expect(healed).toHaveLength(1);
    expect(ids(healed[0]?.statuses ?? [])).toEqual([
      "s14",
      "s13",
      "s12",
      "s11",
      "s10",
      "s09",
    ]);
  });
});
