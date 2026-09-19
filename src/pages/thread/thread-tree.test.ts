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
  quoteId?: string;
  hiddenQuoteId?: string;
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
  // A real `quote` embeds the whole quoted status; only its id is read here.
  // `quote_id` always accompanies it, and outlives it when the quoted author is
  // muted or blocked (`maybe_render_quote`,
  // lib/pleroma/web/mastodon_api/views/status_view.ex).
  ...(fields.quoteId === undefined
    ? {}
    : { quote_id: fields.quoteId, quote: { id: fields.quoteId } }),
  ...(fields.hiddenQuoteId === undefined
    ? {}
    : { quote_id: fields.hiddenQuoteId }),
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

  test("a post the subject quotes stays out, together with its replies", () => {
    // Akkoma gives a locally composed quote the quoted post's context
    // (`make_context/1`, lib/pleroma/web/common_api/utils.ex), so the quoted
    // post and its whole thread arrive in this status's `/context` with no
    // reply edge to the subject. The card already shows the quote.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      quoteId: "119999999999999990",
    });
    const quoted = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "bob",
    });
    const replyToQuoted = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:30:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ ancestors: [quoted], descendants: [replyToQuoted] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("a quoted post mid-thread takes its whole run out", () => {
    // The quoted post is a reply, so the run that arrives with it is headed by
    // its own parent — which has no quote of its own to link it to the
    // subject.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      quoteId: "119999999999999990",
    });
    const quotedParent = status({
      id: "119999999999999980",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "bob",
    });
    const quoted = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:30:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999980",
    });
    const replyToQuoted = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:40:00.000Z",
      acct: "bob",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [quotedParent, quoted, replyToQuoted] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("another quote of the quoted post stays out through it", () => {
    // Every local quote of the same post inherits that post's context, so a
    // sibling quote arrives too — linked to the subject only through the
    // quoted post, never directly.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      quoteId: "119999999999999990",
    });
    const quoted = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "bob",
    });
    const replyToQuoted = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:30:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999990",
    });
    const otherQuote = status({
      id: "119999999999999992",
      createdAt: "2026-08-01T11:40:00.000Z",
      acct: "dave@fixture.example",
      quoteId: "119999999999999990",
    });
    const replyToOtherQuote = status({
      id: "119999999999999993",
      createdAt: "2026-08-01T11:50:00.000Z",
      acct: "bob",
      inReplyToId: "119999999999999992",
    });

    const rows = buildThread(
      subject,
      context({
        descendants: [quoted, replyToQuoted, otherQuote, replyToOtherQuote],
      }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("a quote chain drops a run that only links through a later one", () => {
    // The subject quotes a reply in a thread whose root quotes an older post:
    // all three threads share one context. The older post's run comes first
    // in time but has nothing to link to until the quoted thread is dropped.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      quoteId: "119999999999999991",
    });
    const older = status({
      id: "119999999999999980",
      createdAt: "2026-08-01T10:00:00.000Z",
      acct: "carol@fixture.example",
    });
    const quotingOlder = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "bob",
      quoteId: "119999999999999980",
    });
    const quotedReply = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:30:00.000Z",
      acct: "dave@fixture.example",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [older, quotingOlder, quotedReply] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("a post quoting the subject stays out, together with its replies", () => {
    // The same inheritance seen from the quoted side: opening the quoted post
    // brings the quoting post's thread into the context.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const quoting = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T12:05:00.000Z",
      acct: "bob",
      quoteId: "110000000000000001",
    });
    const replyToQuoting = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T12:06:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [quoting, replyToQuoting] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("a quote hidden by a mute still keeps the quoted thread out", () => {
    // Akkoma renders `quote` as null when the quoted author is muted or
    // blocked, while `quote_id` stays (`maybe_render_quote`,
    // lib/pleroma/web/mastodon_api/views/status_view.ex). The context was still
    // inherited, so the quoted thread arrives all the same.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      hiddenQuoteId: "119999999999999990",
    });
    const quoted = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "bob",
    });
    const replyToQuoted = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:30:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [quoted, replyToQuoted] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
  });

  test("a reply's quote is no link, so the quoted run is still drawn", () => {
    // `make_context/1` matches `in_reply_to` before `quote`
    // (lib/pleroma/web/common_api/utils.ex): a quoting post that is itself a
    // reply keeps its parent's context, so nothing explains the quoted run
    // being here except the conversation itself.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const reply = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      acct: "bob",
      inReplyToId: "110000000000000001",
      quoteId: "119999999999999990",
    });
    const quoted = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "carol@fixture.example",
    });
    const replyToQuoted = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:10:00.000Z",
      acct: "bob",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [reply, quoted, replyToQuoted] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["110000000000000002", "descendant"],
      ["119999999999999990", "detached"],
      ["119999999999999991", "detached"],
    ]);
  });

  test("a quote by a reply to an un-ingested post is no link either", () => {
    // The reply side wins over the quote side for the context whether or not
    // this instance holds the parent, so the un-ingested sentinel counts as a
    // reply just like an id does.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const quoting = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T12:05:00.000Z",
      acct: "bob",
      inReplyToId: "_",
      quoteId: "110000000000000001",
    });
    const replyToQuoting = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T12:06:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999990",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [quoting, replyToQuoting] }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["119999999999999990", "detached"],
      ["119999999999999991", "detached"],
    ]);
  });

  test("only the quote-linked detached run is dropped", () => {
    // The quote lands on a descendant, not on the subject: what keeps a run
    // out is a link to the conversation as drawn, not to the opened status.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
    });
    const reply = status({
      id: "110000000000000002",
      createdAt: "2026-08-01T12:01:00.000Z",
      acct: "bob",
      inReplyToId: "110000000000000001",
    });
    const quoting = status({
      id: "119999999999999990",
      createdAt: "2026-08-01T11:00:00.000Z",
      acct: "carol@fixture.example",
      quoteId: "110000000000000002",
    });
    const replyToQuoting = status({
      id: "119999999999999991",
      createdAt: "2026-08-01T11:10:00.000Z",
      acct: "bob",
      inReplyToId: "119999999999999990",
    });
    // A branch cut off by a federation hole, with no quote anywhere.
    const orphan = status({
      id: "119999999999999992",
      createdAt: "2026-08-01T12:05:00.000Z",
      acct: "carol@fixture.example",
      inReplyToId: "119999999999999900",
    });
    const belowOrphan = status({
      id: "119999999999999993",
      createdAt: "2026-08-01T12:06:00.000Z",
      acct: "bob",
      inReplyToId: "119999999999999992",
    });

    const rows = buildThread(
      subject,
      context({
        descendants: [reply, quoting, replyToQuoting, orphan, belowOrphan],
      }),
    );

    expect(layout(rows)).toEqual([
      ["110000000000000001", "subject"],
      ["110000000000000002", "descendant"],
      ["119999999999999992", "detached"],
      ["119999999999999993", "detached"],
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

  test("a reply cycle the reader reaches through a quote stays out", () => {
    // The cycle members never qualify as detached roots, so only the fallback
    // sweep draws them — it owes the same answer to a quote link as the roots.
    const subject = status({
      id: "110000000000000001",
      createdAt: "2026-08-01T12:00:00.000Z",
      quoteId: "110000000000000003",
    });
    const loopHead = status({
      id: "110000000000000003",
      createdAt: "2026-08-01T12:02:00.000Z",
      acct: "bob",
      inReplyToId: "110000000000000004",
    });
    const loopTail = status({
      id: "110000000000000004",
      createdAt: "2026-08-01T12:03:00.000Z",
      acct: "bob",
      inReplyToId: "110000000000000003",
    });

    const rows = buildThread(
      subject,
      context({ descendants: [loopTail, loopHead] }),
    );

    expect(layout(rows)).toEqual([["110000000000000001", "subject"]]);
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
