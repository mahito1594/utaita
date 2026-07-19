import type { components } from "../../api/schema";

type Status = components["schemas"]["Status"];

// The store is a list of segments, newest segment first, each holding a
// contiguous run of statuses (also newest-first). A boundary between two
// segments *is* the gap — there is no separate gap type to keep in sync
// (see plan doc, "セグメントモデル").
export type Segment = {
  readonly statuses: readonly Status[];
};

// `id` is optional in the generated type (spec lags the wire, per
// entities/status/parse.ts precedent) even though every real status carries
// one; falling back to "" only affects malformed input, never real data.
const idOf = (status: Status): string => status.id ?? "";

const dedupeAgainst = (
  page: readonly Status[],
  known: ReadonlySet<string>,
): Status[] => page.filter((status) => !known.has(idOf(status)));

const replaceAt = (
  segments: readonly Segment[],
  i: number,
  segment: Segment,
): Segment[] => [...segments.slice(0, i), segment, ...segments.slice(i + 1)];

/**
 * Extends segment `i`'s tail with an older page (fetched via that segment's
 * last status as `max_id`). If the page's IDs reach into the following
 * segment, the two segments merge into one — this is how a gap closes,
 * whether the caller is walking infinite-scroll pages (no following segment
 * yet) or filling a known gap (a following segment already exists).
 */
export const appendOlder = (
  segments: readonly Segment[],
  i: number,
  page: readonly Status[],
): Segment[] => {
  if (page.length === 0) return [...segments];
  const target = segments[i];
  if (target === undefined) return [...segments];

  const known = new Set(target.statuses.map(idOf));
  const fresh = dedupeAgainst(page, known);

  const next = segments[i + 1];
  if (next === undefined) {
    return replaceAt(segments, i, {
      statuses: [...target.statuses, ...fresh],
    });
  }

  const nextIds = new Set(next.statuses.map(idOf));
  const overlapIndex = fresh.findIndex((status) => nextIds.has(idOf(status)));
  if (overlapIndex === -1) {
    return replaceAt(segments, i, {
      statuses: [...target.statuses, ...fresh],
    });
  }

  // The page reached statuses already present in the next segment: the two
  // segments describe one continuous run, so they collapse into one and the
  // gap boundary between them disappears.
  const merged: Segment = {
    statuses: [
      ...target.statuses,
      ...fresh.slice(0, overlapIndex),
      ...next.statuses,
    ],
  };
  return [...segments.slice(0, i), merged, ...segments.slice(i + 2)];
};

/**
 * Applies a forward (`since_id`) page to the head of the store. `mayHaveGap`
 * is the caller's verdict from the page size (a full page leaves it unknown
 * whether more statuses exist beyond it): when false, the page is known
 * contiguous with the current head and merges into it; when true, the page
 * becomes a new head segment with an unresolved gap below it, to be closed
 * later by `appendOlder`. An empty store just adopts the page as its first
 * segment (this also covers the initial, param-less load).
 */
export const applyRefresh = (
  segments: readonly Segment[],
  page: readonly Status[],
  mayHaveGap: boolean,
): Segment[] => {
  if (page.length === 0) return [...segments];

  const head = segments[0];
  if (head === undefined) return [{ statuses: [...page] }];

  if (mayHaveGap) return [{ statuses: [...page] }, ...segments];

  const known = new Set(head.statuses.map(idOf));
  const fresh = dedupeAgainst(page, known);
  return replaceAt(segments, 0, { statuses: [...fresh, ...head.statuses] });
};
