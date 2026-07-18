// @vitest-environment happy-dom
// Card-behavior tests through the timeline page (ADR-0009: observable
// behavior at page level; the pipeline internals are covered in
// entities/status/content.test.ts under jsdom).
import { MemoryRouter, query, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import type { Status } from "../../entities/status/StatusCard";
import { ProfilePage } from "../profile/ProfilePage";
import { TimelinePage } from "./TimelinePage";

const mentionStatus: Status = {
  id: "110000000000000001",
  content:
    '<p>hi <a class="u-url mention" href="https://fixture.example/users/carol">@carol</a></p>',
  created_at: "2026-07-05T12:00:00.000Z",
  mentions: [
    {
      id: "900000000000000003",
      acct: "carol@fixture.example",
      username: "carol",
      url: "https://fixture.example/users/carol",
    },
  ],
  account: {
    id: "900000000000000001",
    acct: "alice@fixture.example",
    display_name: "Alice Example",
  },
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  query.clear();
});
afterAll(() => server.close());

const renderApp = () =>
  render(() => (
    <MemoryRouter>
      <Route path="/" component={TimelinePage} />
      <Route path="/users/:acct" component={ProfilePage} />
    </MemoryRouter>
  ));

test("a mention tap navigates to the in-app profile page", async () => {
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([mentionStatus]),
    ),
  );
  const { findByRole, findByText } = renderApp();

  const mention = await findByRole("link", { name: "@carol" });
  await userEvent.click(mention);

  expect(await findByText("@carol@fixture.example")).toBeInTheDocument();
  expect(await findByText(/not implemented/i)).toBeInTheDocument();
});

test("a boost flattens into one card with a boost line", async () => {
  const boost: Status = {
    id: "110000000000000010",
    created_at: "2026-07-05T13:00:00.000Z",
    account: {
      id: "900000000000000002",
      acct: "bob",
      display_name: "Bob Booster",
    },
    reblog: {
      id: "110000000000000001",
      content: "<p>Original words</p>",
      created_at: "2026-07-05T12:00:00.000Z",
      account: {
        id: "900000000000000001",
        acct: "alice@fixture.example",
        display_name: "Alice Example",
      },
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([boost])),
  );
  const { findByText } = renderApp();

  expect(await findByText(/boosted by/)).toHaveTextContent(
    "boosted by Bob Booster",
  );
  expect(await findByText("Original words")).toBeInTheDocument();
  expect(await findByText("Alice Example")).toBeInTheDocument();
});

test("a reply shows the reply-to line above the body", async () => {
  const reply: Status = {
    id: "110000000000000011",
    content: "<p>An answer</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    in_reply_to_id: "110000000000000001",
    pleroma: { in_reply_to_account_acct: "dave@fixture.example" },
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([reply])),
  );
  const { findByText } = renderApp();

  expect(await findByText(/replying to/)).toHaveTextContent(
    "replying to @dave@fixture.example",
  );
});

test("display names render custom emoji as images", async () => {
  const emojiName: Status = {
    id: "110000000000000012",
    content: "<p>text</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice :party:",
      emojis: [
        { shortcode: "party", url: "https://fixture.example/emoji/party.png" },
      ],
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([emojiName])),
  );
  const { findByAltText } = renderApp();

  expect(await findByAltText(":party:")).toBeInTheDocument();
});

test("a content warning hides the body until expanded, without unmounting it", async () => {
  const cwStatus: Status = {
    id: "110000000000000013",
    content: "<p>Spoiled contents</p>",
    spoiler_text: "CW: the reveal",
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([cwStatus])),
  );
  const { findByRole, findByText } = renderApp();

  const toggle = await findByRole("button", { name: "CW: the reveal" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  // Present in the DOM (hidden, not unmounted) but invisible.
  expect(await findByText("Spoiled contents")).not.toBeVisible();

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(await findByText("Spoiled contents")).toBeVisible();
});

test("sensitive media hides behind a reveal button; missing blurhash does not crash", async () => {
  // blurhash is absent from the generated Attachment type (spec lags the
  // wire) — and absent from this remote-style fixture too, exercising the
  // plain-placeholder fallback.
  const sensitiveStatus: Status = {
    id: "110000000000000014",
    content: "<p>look at this</p>",
    sensitive: true,
    created_at: "2026-07-05T12:00:00.000Z",
    media_attachments: [
      {
        id: "300000000000000001",
        type: "image",
        url: "https://fixture.example/media/full.png",
        preview_url: "https://fixture.example/media/preview.png",
        description: "a fixture image",
      },
    ],
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([sensitiveStatus]),
    ),
  );
  const { findByRole, findByAltText, queryByAltText } = renderApp();

  const reveal = await findByRole("button", { name: "Show media" });
  expect(queryByAltText("a fixture image")).not.toBeInTheDocument();

  await userEvent.click(reveal);
  expect(await findByAltText("a fixture image")).toBeInTheDocument();
});

test("non-sensitive images render directly with alt text", async () => {
  const mediaStatus: Status = {
    id: "110000000000000015",
    content: "<p>photo</p>",
    sensitive: false,
    created_at: "2026-07-05T12:00:00.000Z",
    media_attachments: [
      {
        id: "300000000000000002",
        type: "image",
        url: "https://fixture.example/media/full2.png",
        preview_url: "https://fixture.example/media/preview2.png",
        description: "second fixture image",
      },
      {
        id: "300000000000000003",
        type: "image",
        url: "https://fixture.example/media/full3.png",
        description: "third fixture image",
      },
    ],
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([mediaStatus])),
  );
  const { findByAltText, queryByRole } = renderApp();

  expect(await findByAltText("second fixture image")).toBeInTheDocument();
  expect(await findByAltText("third fixture image")).toBeInTheDocument();
  expect(queryByRole("button", { name: "Show media" })).not.toBeInTheDocument();
});

test("tapping an image opens the overlay; closing pops history", async () => {
  const mediaStatus: Status = {
    id: "110000000000000016",
    content: "<p>pic</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    media_attachments: [
      {
        id: "300000000000000004",
        type: "image",
        url: "https://fixture.example/media/full4.png",
        preview_url: "https://fixture.example/media/preview4.png",
        description: "overlay fixture",
      },
    ],
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([mediaStatus])),
  );
  const { findByRole } = renderApp();

  await userEvent.click(
    await findByRole("button", { name: "overlay fixture" }),
  );
  // Query via screen: the overlay is a native <dialog>, whose implicit ARIA
  // role is "dialog" once shown (no explicit role attribute needed).
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toBeInTheDocument();

  // Close = navigate(-1): the back gesture and the button share this path.
  // If same-path navigation ever stopped pushing (solid-router internal
  // behavior, not documented), there would be no entry to pop and the dialog
  // would survive this click.
  await userEvent.click(await screen.findByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  // Still on the timeline, not navigated away.
  expect(
    await findByRole("button", { name: "overlay fixture" }),
  ).toBeInTheDocument();
});

test("a quote renders as a depth-1 mini-card and strips the RE: link", async () => {
  const quoteInline =
    '<span class="quote-inline"><br />RE: <a href="https://fixture.example/objects/aaa">https://fixture.example/objects/aaa</a></span>';
  const quoted: Status = {
    id: "110000000000000020",
    content: `<p>nested words${quoteInline}</p>`,
    created_at: "2026-07-05T11:00:00.000Z",
    // Depth 2: must NOT render as a card inside the mini-card.
    quote: {
      id: "110000000000000021",
      content: "<p>deepest words</p>",
      created_at: "2026-07-05T10:00:00.000Z",
      account: {
        id: "900000000000000005",
        acct: "erin@fixture.example",
        display_name: "Erin Deepest",
      },
    },
    account: {
      id: "900000000000000004",
      acct: "quinn@fixture.example",
      display_name: "Quinn Quoted",
    },
  };
  const quoting: Status = {
    id: "110000000000000022",
    content: `<p>my take${quoteInline}</p>`,
    created_at: "2026-07-05T12:00:00.000Z",
    quote: quoted,
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([quoting])),
  );
  const { findByText, queryByText } = renderApp();

  // Mini-card: quoted author and body are visible.
  expect(await findByText("Quinn Quoted")).toBeInTheDocument();
  expect(await findByText("nested words")).toBeInTheDocument();
  // The quoting body's RE: link is stripped (a card replaces it)…
  expect(queryByText(/my takeRE:/)).not.toBeInTheDocument();
  // …but the mini-card keeps its own RE: link (depth cut) instead of
  // rendering the depth-2 status as another card.
  expect(
    await findByText("https://fixture.example/objects/aaa"),
  ).toBeInTheDocument();
  expect(queryByText("Erin Deepest")).not.toBeInTheDocument();
  expect(queryByText("deepest words")).not.toBeInTheDocument();
});

test("a null quote keeps the body's RE: link as the fallback", async () => {
  const unfetchedQuote: Status = {
    id: "110000000000000023",
    content:
      '<p>look at this<span class="quote-inline"><br />RE: <a href="https://remote.example/objects/bbb">https://remote.example/objects/bbb</a></span></p>',
    quote: null,
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([unfetchedQuote]),
    ),
  );
  const { findByText } = renderApp();

  expect(
    await findByText("https://remote.example/objects/bbb"),
  ).toBeInTheDocument();
});

test("a poll renders options, counts, and its closed state read-only", async () => {
  // own_votes is absent from the generated Poll type (spec lags the wire) —
  // non-fresh variable sidesteps the excess-property check.
  const rawPoll = {
    id: "500000000000000001",
    options: [
      { title: "accept", votes_count: 6 },
      { title: "deny", votes_count: 4 },
    ],
    votes_count: 10,
    voters_count: null,
    multiple: false,
    expired: true,
    expires_at: "2026-07-01T00:00:00.000Z",
    voted: true,
    own_votes: [0],
  };
  const pollStatus: Status = {
    id: "110000000000000030",
    content: "<p>which?</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    poll: rawPoll,
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([pollStatus])),
  );
  const { findByText, queryByRole } = renderApp();

  expect(await findByText("accept")).toBeInTheDocument();
  expect(await findByText("60% (6)")).toBeInTheDocument();
  expect(await findByText("40% (4)")).toBeInTheDocument();
  expect(await findByText(/10 votes/)).toBeInTheDocument();
  expect(await findByText(/closed/)).toBeInTheDocument();
  // Read-only: options are not buttons or inputs.
  expect(queryByRole("radio")).not.toBeInTheDocument();
  expect(queryByRole("checkbox")).not.toBeInTheDocument();
});

test("a link preview renders title and provider as an external link", async () => {
  const cardStatus: Status = {
    id: "110000000000000031",
    content: "<p>came across this</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    card: {
      type: "link",
      url: "https://conf.example/2026",
      title: "Fixture Conference 2026",
      description: "an event",
      provider_name: "conf.example",
      image: "https://conf.example/ogp.png",
    },
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([cardStatus])),
  );
  const { findByRole, findByText } = renderApp();

  const preview = await findByRole("link", {
    name: /Fixture Conference 2026/,
  });
  expect(preview).toHaveAttribute("href", "https://conf.example/2026");
  expect(preview).toHaveAttribute("target", "_blank");
  expect(await findByText("conf.example")).toBeInTheDocument();
});

test("a card with an unsafe url scheme renders the preview text without an anchor", async () => {
  const unsafeCardStatus: Status = {
    id: "110000000000000034",
    content: "<p>suspicious link</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    card: {
      type: "link",
      url: "javascript:alert(1)",
      title: "Fixture Unsafe Card",
      description: "a suspicious link",
      provider_name: "conf.example",
    },
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([unsafeCardStatus]),
    ),
  );
  const { findByText, queryByRole } = renderApp();

  expect(await findByText("Fixture Unsafe Card")).toBeInTheDocument();
  expect(
    queryByRole("link", { name: /Fixture Unsafe Card/ }),
  ).not.toBeInTheDocument();
});

test("an unknown-type attachment with an unsafe url scheme renders its description without an anchor", async () => {
  const unsafeAttachmentStatus: Status = {
    id: "110000000000000035",
    content: "<p>weird attachment</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    media_attachments: [
      {
        id: "300000000000000005",
        type: "unknown",
        url: "javascript:alert(1)",
        description: "an unsafe attachment",
      },
    ],
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([unsafeAttachmentStatus]),
    ),
  );
  const { findByText, queryByRole } = renderApp();

  expect(await findByText("an unsafe attachment")).toBeInTheDocument();
  expect(
    queryByRole("link", { name: "an unsafe attachment" }),
  ).not.toBeInTheDocument();
});

test("reaction chips render unicode and image reactions with counts", async () => {
  // Reaction url is absent from the generated type (spec lags the wire) —
  // non-fresh variables sidestep the excess-property check.
  const unicodeReaction = { name: "😸", count: 3, me: true };
  const remoteReaction = {
    name: "neofox@remote.example",
    count: 1,
    me: false,
    url: "https://remote.example/emoji/neofox.png",
  };
  const reactedStatus: Status = {
    id: "110000000000000032",
    content: "<p>popular post</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    pleroma: { emoji_reactions: [unicodeReaction, remoteReaction] },
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([reactedStatus]),
    ),
  );
  const { findByText, findByAltText, findByTitle } = renderApp();

  const unicodeChip = await findByTitle("😸");
  expect(unicodeChip).toHaveTextContent("😸");
  expect(unicodeChip).toHaveTextContent("3");
  expect(unicodeChip).toHaveAttribute("data-me");

  expect(await findByAltText("neofox@remote.example")).toBeInTheDocument();
  expect(await findByText("1")).toBeInTheDocument();
});

test("the action bar shows counts read-only", async () => {
  const countedStatus: Status = {
    id: "110000000000000033",
    content: "<p>counted</p>",
    created_at: "2026-07-05T12:00:00.000Z",
    replies_count: 2,
    reblogs_count: 5,
    favourites_count: 12,
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () =>
      HttpResponse.json([countedStatus]),
    ),
  );
  const { findByTitle } = renderApp();

  expect(await findByTitle("replies")).toHaveTextContent("2");
  expect(await findByTitle("boosts")).toHaveTextContent("5");
  expect(await findByTitle("favourites")).toHaveTextContent("12");
  // Read-only: none of them are buttons.
  expect((await findByTitle("bookmark")).tagName).toBe("SPAN");
});

test("external links are decorated to open in a new tab", async () => {
  const linkStatus: Status = {
    id: "110000000000000002",
    content: '<p><a href="https://elsewhere.test/article">read this</a></p>',
    created_at: "2026-07-05T12:00:00.000Z",
    account: {
      id: "900000000000000001",
      acct: "alice@fixture.example",
      display_name: "Alice Example",
    },
  };
  server.use(
    http.get("*/api/v1/timelines/home", () => HttpResponse.json([linkStatus])),
  );
  const { findByRole } = renderApp();

  const link = await findByRole("link", { name: "read this" });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
