/**
 * The server-side clamp on every list endpoint's `limit` ("will be ignored if
 * it's more than 40", schema.d.ts; `Pleroma.Pagination`'s max), measured
 * against the reference instance (ADR-0004 amendment). A request that sends a
 * `limit` sends this one, and a page that comes back exactly this long cannot
 * rule out more items beyond it. The timelines' very first fetch sends none
 * and adopts its page outright (timeline-store.ts).
 */
export const PAGE_LIMIT = 40;
