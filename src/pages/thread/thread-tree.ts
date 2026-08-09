import type { Status } from "../../entities/status/types";
import type { ThreadContext } from "./thread-api";

// Akkoma marks a reply whose parent this instance has never ingested with this
// sentinel in place of an id; the parent's AP id survives in
// `akkoma.in_reply_to_apid` (docs/PLAN.ja.md, Akkoma pitfalls).
const UNFETCHED_PARENT = "_";

/** What a row replies to, as far as the fetched conversation can tell. */
export type ReplyTarget =
  | { readonly kind: "root" }
  | { readonly kind: "status"; readonly status: Status }
  /**
   * The parent exists but this instance has not ingested it. `apId` is what an
   * explicit fetch resolves; null when even that is missing, leaving no way to
   * reach the parent from here.
   */
  | { readonly kind: "unfetched"; readonly apId: string | null }
  /** The parent has an id, but the conversation as fetched does not contain it. */
  | { readonly kind: "missing"; readonly id: string };

/**
 * How a row sits relative to the subject — the status the reader opened.
 * `detached` is the honest answer for a status the conversation contains but
 * cannot be connected to the subject.
 */
export type ThreadPlace = "ancestor" | "subject" | "descendant" | "detached";

export type ThreadRow = {
  readonly status: Status;
  readonly place: ThreadPlace;
  readonly replyTo: ReplyTarget;
  readonly repliesToSubject: boolean;
};

// `id` is optional in the generated type even though every real status carries
// one (segments.ts holds the same note). Statuses are tracked by reference
// rather than by id so that an id-less one still gets placed instead of
// colliding with every other id-less one.
const idOf = (status: Status): string | undefined => status.id;

const timeOf = (status: Status): number => {
  const parsed = Date.parse(status.created_at ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Siblings are ordered by `created_at`, never by id: a flake id records the
// order this instance inserted a status, so a post ingested late carries a
// large id however old it is (docs/PLAN.ja.md, Akkoma pitfalls). The id breaks
// ties only to keep the order total.
const byTime = (a: Status, b: Status): number => {
  const elapsed = timeOf(a) - timeOf(b);
  if (elapsed !== 0) return elapsed;
  const idA = idOf(a) ?? "";
  const idB = idOf(b) ?? "";
  if (idA < idB) return -1;
  return idA > idB ? 1 : 0;
};

const replyTargetOf = (
  status: Status,
  byId: ReadonlyMap<string, Status>,
): ReplyTarget => {
  const parentId = status.in_reply_to_id;
  if (parentId === undefined || parentId === null) return { kind: "root" };
  if (parentId === UNFETCHED_PARENT) {
    return { kind: "unfetched", apId: status.akkoma?.in_reply_to_apid ?? null };
  }
  const parent = byId.get(parentId);
  return parent === undefined
    ? { kind: "missing", id: parentId }
    : { kind: "status", status: parent };
};

// The subject leads the merge so that a copy of it in either context array
// loses to the one the caller holds.
const unionOf = (subject: Status, context: ThreadContext): Status[] => {
  const union: Status[] = [];
  const seen = new Set<string>();
  for (const status of [
    subject,
    ...context.ancestors,
    ...context.descendants,
  ]) {
    const id = idOf(status);
    if (id !== undefined) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    union.push(status);
  }
  return union;
};

const indexById = (union: readonly Status[]): Map<string, Status> => {
  const byId = new Map<string, Status>();
  for (const status of union) {
    const id = idOf(status);
    if (id !== undefined) byId.set(id, status);
  }
  return byId;
};

const indexByParentId = (union: readonly Status[]): Map<string, Status[]> => {
  const children = new Map<string, Status[]>();
  for (const status of union) {
    const parentId = status.in_reply_to_id;
    if (
      parentId === undefined ||
      parentId === null ||
      parentId === UNFETCHED_PARENT
    ) {
      continue;
    }
    const siblings = children.get(parentId);
    if (siblings === undefined) children.set(parentId, [status]);
    else siblings.push(status);
  }
  for (const siblings of children.values()) siblings.sort(byTime);
  return children;
};

/** The chain from the subject up to the oldest parent on hand, root first. */
const ancestorChainOf = (
  subject: Status,
  byId: ReadonlyMap<string, Status>,
): Status[] => {
  const chain: Status[] = [];
  const visited = new Set<Status>([subject]);
  let cursor = subject;
  for (;;) {
    const target = replyTargetOf(cursor, byId);
    if (target.kind !== "status" || visited.has(target.status)) break;
    visited.add(target.status);
    chain.push(target.status);
    cursor = target.status;
  }
  return chain.reverse();
};

/**
 * Everything below `root`, depth-first: a reply is followed by its own replies
 * before the next sibling, so one branch reads as one uninterrupted run (the
 * thread view draws no indentation to carry the structure). `placed` both
 * excludes statuses another part of the thread already owns and keeps a
 * malformed reply cycle from looping forever.
 */
const subtreeOf = (
  root: Status,
  children: ReadonlyMap<string, Status[]>,
  placed: Set<Status>,
): Status[] => {
  const out: Status[] = [];
  const walk = (status: Status): void => {
    const id = idOf(status);
    if (id === undefined) return;
    for (const child of children.get(id) ?? []) {
      if (placed.has(child)) continue;
      placed.add(child);
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
};

/** Whether walking up from `status` arrives at one of `targets`. */
const climbsTo = (
  status: Status,
  byId: ReadonlyMap<string, Status>,
  targets: ReadonlySet<Status>,
): boolean => {
  const visited = new Set<Status>([status]);
  let cursor = status;
  for (;;) {
    const target = replyTargetOf(cursor, byId);
    if (target.kind !== "status") return false;
    if (targets.has(target.status)) return true;
    if (visited.has(target.status)) return false;
    visited.add(target.status);
    cursor = target.status;
  }
};

/**
 * Rows for the conversation the merge could not attach to the subject, each
 * detached root followed by its own replies. Federation drops posts, and a
 * context that lost a middle status would otherwise take every reply under it
 * out of the view without a trace.
 */
const detachedRowsOf = (
  union: readonly Status[],
  byId: ReadonlyMap<string, Status>,
  children: ReadonlyMap<string, Status[]>,
  placed: Set<Status>,
  spine: ReadonlySet<Status>,
): Status[] => {
  const detached = union.filter(
    (status) => !placed.has(status) && !climbsTo(status, byId, spine),
  );
  const detachedSet = new Set(detached);
  // A detached status whose parent is detached too belongs under that parent,
  // not at the head of a run of its own.
  const roots = detached
    .filter((status) => {
      const target = replyTargetOf(status, byId);
      return target.kind !== "status" || !detachedSet.has(target.status);
    })
    .sort(byTime);

  const rows: Status[] = [];
  for (const root of roots) {
    if (placed.has(root)) continue;
    placed.add(root);
    rows.push(root, ...subtreeOf(root, children, placed));
  }
  return rows;
};

/**
 * Flattens a status and its `/context` into the rows the thread view draws, in
 * display order: the ancestor chain (root first), the subject, then the
 * subject's descendants depth-first.
 *
 * The context's own ancestors / descendants split is ignored. Akkoma cuts the
 * conversation by local insertion order, so a parent ingested after its child
 * comes back under `descendants` (docs/PLAN.ja.md, Akkoma pitfalls); both
 * arrays are merged with the subject and the shape is re-derived from
 * `in_reply_to_id` alone.
 *
 * Replies on other branches — reachable through an ancestor but not through
 * the subject — are left out, since the subject's own branch is what this view
 * is about. A status that reaches neither is not dropped: it lands at the end
 * as a `detached` row, together with whatever replies to it.
 */
export const buildThread = (
  subject: Status,
  context: ThreadContext,
): ThreadRow[] => {
  const union = unionOf(subject, context);
  const byId = indexById(union);
  const children = indexByParentId(union);

  const ancestors = ancestorChainOf(subject, byId);
  const spine = new Set<Status>([...ancestors, subject]);
  const placed = new Set<Status>(spine);
  const descendants = subtreeOf(subject, children, placed);
  const detached = detachedRowsOf(union, byId, children, placed, spine);

  const subjectId = idOf(subject);
  const toRow = (status: Status, place: ThreadPlace): ThreadRow => ({
    status,
    place,
    replyTo: replyTargetOf(status, byId),
    repliesToSubject:
      subjectId !== undefined && status.in_reply_to_id === subjectId,
  });

  return [
    ...ancestors.map((status) => toRow(status, "ancestor")),
    toRow(subject, "subject"),
    ...descendants.map((status) => toRow(status, "descendant")),
    ...detached.map((status) => toRow(status, "detached")),
  ];
};
