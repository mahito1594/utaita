import { describe, expect, test } from "vitest";
import type { Status } from "../../entities/status/types";
import type { ThreadContext } from "./thread-api";
import { buildThread } from "./thread-tree";

// Hand-written, anonymized fixtures typed against the generated schema — the
// type system vouches for their shape, and no real instance data enters the
// repo (ADR-0002 amendment). Ids are 18 characters like real flake ids, but
// unlike a timeline page they are deliberately *not* laid out in time order:
// inside a thread the two orders come apart (docs/PLAN.ja.md, Akkoma
// pitfalls), and fixtures that agreed on both would hide it.
const status = (fields: {
  id: string;
  createdAt: string;
  acct?: string;
  inReplyToId?: string | null;
  inReplyToApId?: string | null;
}): Status => ({
  id: fields.id,
  created_at: fields.createdAt,
  content: `<p>${fields.id}</p>`,
  in_reply_to_id: fields.inReplyToId ?? null,
  account: {
    id: "900000000000000001",
    acct: fields.acct ?? "alice@fixture.example",
    display_name: "Alice Example",
  },
  ...(fields.inReplyToApId === undefined
    ? {}
    : { akkoma: { in_reply_to_apid: fields.inReplyToApId } }),
});

const context = (parts?: Partial<ThreadContext>): ThreadContext => ({
  ancestors: parts?.ancestors ?? [],
  descendants: parts?.descendants ?? [],
});

const layout = (rows: readonly { status: Status; place: string }[]) =>
  rows.map((row) => [row.status.id, row.place]);

describe("buildThread", () => {
  test("a status with an empty context is the whole thread", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });

    const rows = buildThread(subject, context());

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
    expect(rows[0]?.replyTo).toEqual({ kind: "root" });
  });

  test("a parent delivered under descendants is still an ancestor", () => {
    // The shape measured after resolving an un-ingested parent: the parent
    // comes back on the wrong side of the split, and because the instance
    // ingested it after the child it also carries the larger id while being
    // the older post. Trusting either signal would put it below the subject.
    const parent = status({
      id: "119000000000000000",
      createdAt: "2026-08-01T12:00:00.000Z",
      acct: "bob",
    });
    const subject = status({
      id: "110000000000000010",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "119000000000000000",
    });

    const rows = buildThread(subject, context({ descendants: [parent] }));

    expect(layout(rows)).toEqual([
      ["119000000000000000", "ancestor"],
      ["110000000000000010", "subject"],
    ]);
    expect(rows[1]?.replyTo).toEqual({ kind: "status", status: parent });
  });

  test("a reply delivered under ancestors is still a descendant", () => {
    // The same reversal seen from the parent: opening the newly ingested
    // parent puts its child in `ancestors`.
    const subject = status({
      id: "119000000000000000",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const reply = status({
      id: "110000000000000010",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "119000000000000000",
    });

    const rows = buildThread(subject, context({ ancestors: [reply] }));

    expect(layout(rows)).toEqual([
      ["119000000000000000", "subject"],
      ["110000000000000010", "descendant"],
    ]);
  });

  test("siblings are ordered by created_at, not by id", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const later = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "110000000000000001",
    });
    const earlier = status({
      id: "119999999999999999",
      createdAt: "2026-08-01T12:01:00.000Z",
      inReplyToId: "110000000000000001",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [later, earlier] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["119999999999999999", "descendant"],
      ["110000000000000002", "descendant"],
    ]);
  });

  test("a branch runs to its end before the next sibling starts", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const first = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      inReplyToId: "110000000000000001",
    });
    const nested = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:03:00.000Z",
      inReplyToId: "110000000000000002",
    });
    const second = status({
      id: "110000000000000004",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "110000000000000001",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [first, nested, second] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["110000000000000002", "descendant"],
      ["110000000000000003", "descendant"],
      ["110000000000000004", "descendant"],
    ]);
  });

  test("each row names the status it replies to", () => {
    const root = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      acct: "bob",
    });
    const subject = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      inReplyToId: "110000000000000001",
    });
    const reply = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:02:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "110000000000000002",
    });

    const rows = buildThread(
      subject,
      context({ ancestors: [root], descendants: [reply] }),
    );

    expect(rows.map((row) => row.replyTo)).toEqual([
      { kind: "root" },
      { kind: "status", status: root },
      { kind: "status", status: subject },
    ]);
  });

  test("an un-ingested parent carries the AP id an explicit fetch needs", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      inReplyToId: "_",
      inReplyToApId: "https://remote.example/objects/abc",
    });

    const rows = buildThread(subject, context());

    expect(rows[0]?.replyTo).toEqual({
      kind: "unfetched",
      apId: "https://remote.example/objects/abc",
    });
  });

  test("an un-ingested parent with no AP id leaves nothing to fetch", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      inReplyToId: "_",
    });

    const rows = buildThread(subject, context());

    expect(rows[0]?.replyTo).toEqual({ kind: "unfetched", apId: null });
  });

  test("a parent the context does not carry is reported as missing", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      inReplyToId: "119999999999999999",
    });

    const rows = buildThread(subject, context());

    expect(rows[0]?.replyTo).toEqual({ kind: "missing" });
  });

  test("replies cut off from the subject are kept, not dropped", () => {
    // Federation loses posts: a context can arrive without the middle status
    // of a branch. Everything below the hole would otherwise vanish.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const orphan = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:03:00.000Z",
      inReplyToId: "119999999999999999",
    });
    const belowOrphan = status({
      id: "110000000000000004",
      createdAt: "2026-08-01T12:04:00.000Z",
      inReplyToId: "110000000000000003",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [belowOrphan, orphan] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["110000000000000003", "detached"],
      ["110000000000000004", "detached"],
    ]);
  });

  test("a reply cycle among detached statuses still renders", () => {
    // Malformed federated data can close a loop: two posts each naming the
    // other as parent, neither reaching the subject. Neither qualifies as a
    // detached root, so without the fallback sweep both would vanish.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const loopHead = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "110000000000000004",
    });
    const loopTail = status({
      id: "110000000000000004",
      createdAt: "2026-08-01T12:03:00.000Z",
      inReplyToId: "110000000000000003",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [loopTail, loopHead] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["110000000000000003", "detached"],
      ["110000000000000004", "detached"],
    ]);
  });

  test("replies on another branch of the conversation are left out", () => {
    const root = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const subject = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      inReplyToId: "110000000000000001",
    });
    const otherBranch = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:02:00.000Z",
      inReplyToId: "110000000000000001",
    });

    const rows = buildThread(
      subject,
      context({ ancestors: [root], descendants: [otherBranch] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "ancestor"],
      ["110000000000000002", "subject"],
    ]);
  });

  test("the subject the caller holds wins over a copy in the context", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const staleCopy = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });

    const rows = buildThread(subject, context({ descendants: [staleCopy] }));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(subject);
  });

  test("statuses replying to each other terminate instead of looping", () => {
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      inReplyToId: "110000000000000002",
    });
    const other = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      inReplyToId: "110000000000000001",
    });

    const rows = buildThread(subject, context({ ancestors: [other] }));

    expect(layout(rows)).toEqual([
      ["110000000000000002", "ancestor"],
      ["110000000000000001", "subject"],
    ]);
  });
});
