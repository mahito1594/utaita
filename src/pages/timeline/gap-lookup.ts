import type { Segment } from "./segments";

// Maps each non-last segment's tail-status id to that segment's index, so
// the page can render a gap marker right after the matching card in a
// single flat status list instead of giving each segment its own `<For>`
// (which would recreate every card's DOM whenever `appendOlder` replaces
// the segment object, destroying the browser's scroll-anchor candidates —
// ADR-0004 amendment). The last segment has no gap below it — that
// boundary is the sentinel, not a marker.
export const gapBoundariesByTailId = (
  segments: readonly Segment[],
): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  segments.forEach((segment, i) => {
    if (i === segments.length - 1) return;
    const tailId = segment.statuses.at(-1)?.id;
    if (tailId !== undefined) map.set(tailId, i);
  });
  return map;
};
