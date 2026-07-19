// Decides whether a visible sentinel should ask the store for another page.
// Kept pure and DOM-free so it's testable without depending on
// IntersectionObserver actually firing — happy-dom's implementation never
// calls back (see TimelinePage.tsx), which is exactly what this split works
// around (plan doc, "IntersectionObserver").
export type SentinelStatus = {
  // The tail segment's most recent `loadOlder` already came back short:
  // nothing older remains, so a re-fire must not ask again.
  readonly exhausted: boolean;
  // A `loadOlder` for the tail segment is already in flight.
  readonly loading: boolean;
};

export const shouldTriggerLoadOlder = (status: SentinelStatus): boolean =>
  !status.exhausted && !status.loading;
