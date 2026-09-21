# User stories

> The Japanese [stories.ja.md](./stories.ja.md) is the source of truth; this
> file is synced from it at phase boundaries.

Format: one line per story, with acceptance criteria only where they are not
obvious. Stories are grouped by phase; unscheduled ideas go to the Icebox.
Bugs and story-less debt (a refactor, a missing guard) live in GitHub issues —
they need not stay in sync with the code's implementation and verification
state.

> Status: Phase 1 is complete (its done condition opens the Phase 1 section).
> Phase 2 and later are still the initial draft seeded from the roadmap; the
> kickoff rewrites them against real frustrations with pleroma-fe.

## Phase 0 — Foundation

Instead of user stories, a single vertical slice serves as the done condition:

- [x] Fetch a timeline from the reference instance through the dev proxy with
      the generated typed client and render it as a list of status cards
      inside the (rough) app shell. The dev token is injected from env; when
      it is unset, a handled 401/403 (differs per endpoint — see the pitfalls
      in PLAN.md) surfaces in the UI.

## Phase 1 — Read-only MVP

**Done condition**: every story below is checked and holds on both a real
phone and a desktop (one-handed reach, no horizontal scroll), and a full day
of reading passes without opening pleroma-fe. Notifications are the one
exception: they are not dogfoodable without read tracking, and every API that
marks them read needs a write scope, so they belong to Phase 2. Opening
pleroma-fe to look at notifications does not count against the done
condition.

- [x] I can log in with my instance account and stay logged in across browser
      restarts. Logging out reliably returns me to the unauthenticated state
      (Akkoma also sets a session cookie on Bearer requests — see the PLAN
      pitfalls).
  - A URL opened while signed out is kept across the sign-in. Thread
    permalinks are shareable URLs, so "follow a link → not signed in → sign
    in → lose the post" must not happen. The return target is read from
    storage that other same-origin code can write, so it is treated as
    untrusted input: anything that is not an in-app path falls back to `/`
- [x] A shared link to a public post (thread, the lists under it, a profile)
      is readable without signing in. Private posts, and anything the instance
      hides, say "signing in may reveal this" and offer sign-in in place
      ([ADR-0015](./adr/0015-sign-in-gates-only-personal-surfaces.md)). The
      gate stays on the four timeline routes only, and the client never
      judges visibility itself — it follows the server's 401 / 403 / 404
      (Akkoma's anonymous responses are in the PLAN pitfalls). Anonymous
      local / federated feeds are out of scope — a shared link is a post or a
      person, not a feed. The "return to the original URL after sign-in" leg
      is still needed for a private post opened while signed out
- [x] I can read my home timeline with smooth infinite scroll; opening a CW
      does not shift my scroll position.
- [x] A timeline left open can load new posts without a page reload.
  - Manual refresh (a button or pull-to-refresh). Forward fetching
    (`since_id`; a full page means an unfetched span remains, which is
    filled from the GapMarker at the segment boundary) merges in the
    store / segment layer, decoupled from the UI — the Phase 4 streaming /
    auto-refresh toggle reuses the same merge
  - A refresh that lands new posts scrolls to the top. Refresh is an explicit
    action, so the new posts are put in front of the reader; on success it
    always goes to the top, even with zero new posts (an explicit action's
    response does not vary with circumstances); on failure the reading
    position is kept. There is no "return to where I was" leg — the
    GapMarker left by a full page already covers it. A refresh that arrives
    after the page is torn down does not steal the next route's position.
    One point the tests cannot reach: whether the browser's scroll anchoring
    fights `scrollTo(0, 0)` when a full page is prepended while scrolled
    deep — happy-dom has no layout
- [x] I can switch between home / local / bubble / federated. Four path-based
      routes plus tabs in the bar; switching refetches (keeping the position
      across switches is in the Icebox).
- [x] A status card shows everything in a post: body (HTML), attached media,
      CW/sensitive, custom emoji, the boosting account, emoji reactions, polls,
      link previews.
  - The body renders as sanitized HTML
    ([ADR-0013](./adr/0013-dompurify-html-pipeline.md)). Basic tags that
    pleroma-fe drops, such as `<small>`, render correctly. No MFM-specific
    rendering (the `content` HTML is rendered as is)
  - Media: every attachment in a two-column grid (full width for one), tap
    for a simple full-size overlay. Video / audio use native `<video>` /
    `<audio>` (not verified against real data). A swipeable lightbox is in
    the Icebox. Remote attachments missing `blurhash` / `meta` do not crash.
    Sensitive media is hidden by default
  - Polls are read-only (options, vote counts, deadline / closed state; an
    open poll is not verified against real data). Link previews are the
    light version: title plus thumbnail
  - Mentions in the body go to the in-app profile. External links open in a
    new tab (ADR-0011)
  - Quotes render as a depth-1 mini-card under the body (ADR-0007). The
    server-added `span.quote-inline` (the RE: link) is stripped when the
    card renders. A null `quote` (unfetched remote, etc.) and further quotes
    inside the mini-card stay as RE: links
  - The "who" lists for emoji reactions, boosts and favourites are not on
    the card; they belong to the post detail (thread) view (the "who" lists
    story)
  - Cards whose whole-card tap opens the conversation (timeline, ancestors,
    descendants, quote mini-card) get `cursor: pointer`; cards that do not
    (the thread's own subject) keep the arrow. Fixing only one of them would
    make the "tappable / not tappable" signal lie, so StatusCard and
    QuoteCard are aligned together. Tapping a quote mini-card is not
    verified against real data
- [x] I can open a post and read the whole conversation tree without losing
      track of which post I came from
      ([ADR-0014](./adr/0014-thread-view.md)). A whole-card tap goes to
      `/statuses/:id`; branch-first order, zero indentation, no collapsing.
      The ancestors / descendants split from `/context` is not trusted; the
      tree is rebuilt from `in_reply_to_id` (see the PLAN pitfalls).
      Mentions / external links / media / text selection are not swallowed by
      the card tap
  - When the parent is not on the instance (`in_reply_to_id: "_"` — see the
    PLAN pitfalls), **show a placeholder as soon as it is known to be
    unfetched, with an explicit fetch action on it**. No automatic resolve —
    one takes about 2.6 seconds, writes to the instance database and calls
    the remote, and `/api/v2/search` falls back to full-text search over AP
    IDs when it cannot resolve, so it can silently show a different post as
    the parent (ADR-0011 amendment). A link to the origin instance sits next
    to the button as a secondary, explicitly external leg
  - **Being able to fetch a remote post explicitly is itself a
    differentiator** — akkoma-fe has no such feature, and since `"_"` is
    truthy it renders a dead link
  - Going back from a thread does not lose the timeline's reading position
    or its accumulated pages (ADR-0004 amendment). Switching tabs refetches.
    **The way back must be a history back** — scroll restoration only works
    on pop
  - Detached chains that connect to the conversation only through a quote
    are not shown under "Not connected to this post". Akkoma lets a
    non-reply quote inherit the quoted post's context, so the quote's
    `/context` carries the quoted post's thread (see the PLAN pitfalls). The
    quoted post is already visible in the mini-card, so dropping the chain
    loses nothing. The detached mechanism itself stays for threads with
    posts missing in federation
  - On the subject card of a remote post, an external "View on <host>" link
    to the origin server sits under the stats row (same shape as the link in
    the profile header; ADR-0011's "secondary, explicitly external leg"). No
    submenu — there is only one item. **Once Phase 2 gives cards an action
    menu, this link moves there.** Timeline cards do not get it — a row's
    tap opens the conversation, and the exit is placed where the reader
    arrived
- [x] From a thread (post detail) I can open the "who" lists for emoji
      reactions, boosts and favourites
      (`/api/v1/pleroma/statuses/:id/reactions`, `/reblogged_by`,
      `/favourited_by`; none of the three paginate — see the PLAN pitfalls).
  - One page with three tabs: `/statuses/:id/favourited_by` /
    `/reblogged_by` / `/reactions`. The tab is a path segment (not `?type=`
    — `<A>` only sets `aria-current` on a path match, and the timeline and
    profile tab bars follow the same convention). Switching tabs uses
    `replace` (movement within one page, so no history entry; one Back
    returns to the thread. Profile tabs stay push). The heading, the tab
    counts and the list arrive independently within the page — waiting at
    the layout boundary hides the whole surface on a direct arrival
  - The entry is **the thread's subject card only**: a stats row "N boosts ·
    N favourites · N reactions" between the chips and the ActionBar, each
    item linking to its tab. Making the numbers next to the favourite /
    boost icons links was withdrawn — the icon's affordance is "do it", not
    "see who did", and once Phase 2 makes the icons real actions the two
    cannot coexist. The subject card's ActionBar drops its numbers and keeps
    only icons (the same number is never shown twice). Zero items leave the
    row, and an all-zero row is omitted — fewer occasions where a hidden
    list disagrees with the count. Chips carry no link (Phase 2: tap =
    react). Timeline, ancestor and descendant cards keep icon + number with
    no link — in Phase 2 the numbers are expected to become actions
    (favourite / boost). Same shape as Mastodon web (the meta row on post
    detail), Bluesky ("N reposts · N likes" on the thread subject) and
    akkoma-fe (the users row on the focused post only)
  - Reactions are one page with a group heading per emoji (the same chip as
    the card) plus account rows; no per-emoji route. The heading band is
    shorter than a row, `bg.subtle`, bottom border, "N people" next to the
    chip (N is the group's `count` — Akkoma counts before dropping invisible
    accounts, so it can disagree with the row count), and `position:
    sticky` so the reader always knows which emoji they are under. Misskey's
    filter-by-emoji tabs are not adopted — more state and URLs (if the bands
    ever pile up vertically, that is the next step)
  - 404 / 403 render as an error row with Retry; `[]` (private, including
    `show_reactions: false`) renders the empty copy, with no distinction. The
    empty copy does not assert zero — "No favourites to show." — because the
    tab shows the post's count as is, and Akkoma hiding the list or dropping
    unknown / blocked accounts makes the count and the rows disagree
- [x] I can view a profile with posts / replies / media tabs, and see the
      follow relationship (following / follows you). The follow lists
      (following / followers) belong to this story too. Follow actions are
      Phase 2. Wireframe:
      [docs/design/profile-page-20260830.html](./design/profile-page-20260830.html)
  - The posts list uses `exclude_replies=true`. Akkoma drops self-replies
    with this flag too, but a client-side filter breaks pagination, so the
    quirk is accepted as is
  - Going back from a post detail does not lose the profile's reading
    position or its accumulated pages (ADR-0004 amendment: retention is a
    path-keyed history stack, restored only on pop). Same behavior as
    timeline → thread → back
  - Follow lists: `/accounts/:acct/following` / `/followers` as two leaf
    routes; the tab bar keeps the three post tabs (five tabs wrap at 375px).
    The entry is the header's counts, with the two axes handled
    independently — `hide_*_count` shows "hidden" instead of the number,
    and `hide_*` (the list itself) drops the link. Akkoma answers a private
    list with 200 + `[]` for everyone but the owner, so the copy is driven
    by "flag + empty response" with no owner check. Known trade-off: the
    owner also sees "hidden", and an owner who set `hide_*` loses the entry
    link to their own list (Akkoma still serves the real list to the owner
    on a direct URL). The owner check (the id from verify_credentials)
    shares a slot with the Phase 2 follow action. A row is one anchor:
    avatar + display name + acct, no bio or relationship badge. The list's
    `:id` accepts flake ids only; a nickname is 404 (PLAN pitfalls)
  - Pinned posts: the Posts tab starts with the posts fetched via
    `?pinned=true`, each with a "Pinned" marker. Aligned with akkoma-fe /
    Mastodon web / Phanpy / Elk: Posts tab only, no dedupe against the
    chronological list (the same post may appear twice; only the strip
    carries the marker), and no tab filter on the fetch (Akkoma ANDs
    `pinned` with `exclude_replies` — PLAN pitfalls). Remote accounts can
    carry several, so the strip may be several rows. Known limit: the strip
    is outside the reading-position retention, so after a long stay in a
    thread the strip may be inserted after the restore and shift the
    position by its height. If dogfooding notices it, add it to the
    retention
  - Header: the display name starts at the banner's bottom edge; only the
    avatar overlaps the banner. The Following / Follows you badges are
    borderless `bg.subtle` pills (a bordered one next to a link looks
    tappable). The "N posts" / "N following" / "N followers" counts link to
    their tab or list. The three post tabs are hidden above the following /
    followers lists (a list has its own heading). The header's count links
    and the three tabs do not scroll to the top — the header stays and only
    the section below is swapped, which is an in-page section switch, not
    an arrival (the same reasoning as `replace` on the who-list tabs). The
    loading row during a swap reserves the viewport height — if it shrinks
    to one line for a moment the document gets shorter than the viewport
    and the browser rounds scrollY to 0
  - The profile URL prefix is `/accounts/:acct`. Akkoma owns
    `/users/:nickname` at the root for actors, so a reload, a direct link or
    a tab restore gets Akkoma's response instead of the SPA (see the PLAN
    pitfalls). The name follows the client API's `Account` (`/actors/` is an
    AP term with no counterpart in the app)
  - Whether the header wordmark "utaita" becomes the instance name is on
    hold. There is no `/api/v1/instance` query yet; Phase 2 will fetch the
    post length and attachment limits from it, and the name comes with the
    same query, so decide there
- [x] Profile navigation: the avatar and name block on StatusCard link to
      `/accounts/:acct` (not swallowed by the whole-card tap — same treatment
      as mentions) / the header wordmark links to the home timeline (no Back
      button on profiles — the thread's Back exists because scroll
      restoration only works on a history back; wordmark = top of home is
      enough) / a remote account's header carries an external "View on
      <host>" link to its origin profile (`account.url`), because the local
      instance only has the posts it received (opens in a new tab —
      ADR-0011) / the column no longer shifts right while loading, when the
      vertical scrollbar disappears — `scrollbar-gutter: stable`
- [x] Statuses in timelines and threads render full-bleed with rules.
      Per-status card borders, radii and gaps cost vertical density and body
      width, so they are gone; a status is a row (12px side inset +
      1px bottom border). On desktop the column wears the panel; QuoteCard
      stays a card as the signal that a quote is foreign. Threads put the
      spine rule at the screen edge and make the body inset symmetric — the
      subject's two-channel mark stays. Rationale and rejected options:
      [docs/design/timeline-density.md](./design/timeline-density.md)
- [x] Thread screen polish: the Back button is an icon and the "Conversation"
      heading is tidied (the canGoBack branching stays) / post times inside a
      thread show to the minute (timeline cards keep the date; the
      hard-coded "en" locale is not touched — Phase 4) / UnfetchedParent is
      a placeholder card / custom emoji are larger (1.25em ≈ 20px in the body
      was about half of akkoma-fe's measured 38px) / the "Not connected to
      this post" heading and explanation sit in a header band at the top of
      the surface (after the density change the surroundings became surfaces
      and bare text on the canvas stood out) / emoji reaction chips match the
      body size too (akkoma-fe draws body and reactions at the same size; the
      count stays xs as meta information)

## Phase 2 — Writing

- [ ] I can read notifications and tell how far I have read. Mentions,
      boosts, follows and emoji reactions are distinguishable at a glance,
      and unknown types such as `pleroma:emoji_reaction` or `move` do not
      crash. Unread ones are distinguishable and reading marks them read.
  - Moved from Phase 1. Every path that marks notifications read
    (`POST /api/v1/pleroma/notifications/read` needs `write:notifications`,
    `POST /api/v1/markers` needs `follow` / `write:blocks`) is a write scope,
    so with the Phase 1 `read` token `pleroma.is_seen` is stuck at false for
    every item and an unread state cannot exist. Shipping the list alone in
    Phase 1 was rejected — the row and the store would be designed twice,
    the second time around read tracking. Start right after the token scope
    changes (`read` → `read write`; see the login screen story)
- [ ] I can write a post with CW and visibility (including `local`), with
      custom emoji autocomplete.
- [ ] I can attach images with alt text and see upload progress.
- [ ] I can favourite, boost, bookmark and emoji-react from the timeline.
- [ ] I can follow / unfollow from a profile and see the pending state for
      locked accounts.
- [ ] I can search for accounts, hashtags and posts.
- [ ] I can browse my favourited / bookmarked posts (`/api/v1/favourites`,
      `/api/v1/bookmarks`).
- [ ] Finish the login screen to its wireframe
      ([docs/design/login-20260712.html](./design/login-20260712.html)).
      Deliberately left alone in Phase 1 — it is rarely seen, and the Phase 2
      token scope change (`read` → `read write`) sends everyone through the
      login screen again to re-authorize, so implementing it in that slot is
      cheapest

## Icebox

- Catch-up digest for missed posts (Phanpy-style)
- Drafts that survive a closed tab
- Realtime timeline updates via streaming — as a toggle between auto and
  manual refresh (like the old Twitter clients)
- Multiple accounts
- Keeping the scroll position across timeline switches (little value with
  home as the resident timeline; revisit if dogfooding asks for it). "Keep
  the one timeline last viewed, only while leaving for a detail route
  (thread / profile) and coming back" shipped in Phase 1 (ADR-0004
  amendment) — refetching from the top every time a reply is opened and
  closed does not meet the done condition. A switch is a push, where scroll
  restoration does not work, and keeping the pages would leave "stale
  content, at the top, no fetch", which is worse than a refetch, so this
  part stays here
- Media lightbox with swipe and pinch-zoom
- Hashtag timelines (`/api/v1/timelines/tag/{tag}`)
- List timelines (`/api/v1/timelines/list/{list_id}`)
- Reading DMs (the spec's timeline list has no direct — start from Akkoma's
  chats mechanism)
- Filling in replies that exist only remotely (a differentiator that merges
  the origin instance's public API; conflicts with the same-origin premise,
  so needs design)
- Redesign of the card time display: whether relative time ("5m") is good
  design is open — observe whether dogfooding complains, and discuss once
  there is material. No complaints about timeline cards so far. Thread
  times were made minute-precise in Phase 1; the full redesign (precision,
  TZ setting) keeps being observed here. Today the absolute time is a
  calendar display ("Jul 5") in the browser's local TZ (Intl default), and
  the tooltip (`title`) is the API's raw ISO string. Ideally the user picks
  a time zone in settings. Implementation slot: together with Phase 4 i18n
  (time.ts also hard-codes the "en" locale, same spot)
- About screen plus a link to `/THIRD_PARTY_LICENSES.md` (generated by
  Vite's `build.license`). At the same time, import the bug report link and
  the like from `bugs.url` in `package.json`. Whether the attribution file
  is complete (today dependencies whose upstream lacks a LICENSE, such as
  blurhash, appear with an empty body) is decided at implementation time;
  if needed, consider `rollup-plugin-license` as a fallback that
  synthesizes SPDX text. Slot: when i18n / a settings screen exists —
  Phase 4 presumably
- Re-fetch the final result of a closed poll (a remote poll only has the
  counts as of when it federated. Checked in the Akkoma source:
  `GET /api/v1/polls/:id` is the only API that triggers a refetch — for a
  remote object updated more than 60 seconds ago it GETs the origin and
  pulls in the counts and closed state. Defined in openapi.json. Proposal:
  hit polls/:id once when a thread renders and swap the poll in the store.
  Open points: whether one extra request per view is worth it, and how to
  handle delay / failure when the remote is down)
- Translate button (akkoma-fe parity. The API is all in openapi.json: the
  Akkoma form `GET /statuses/{id}/translations/{language}` and the Mastodon
  form `POST /statuses/{id}/translate`, plus the language list
  `/api/v1/instance/translation_languages`. Endpoint choice and UI are
  designed at implementation time. Prerequisite: a translation backend
  configured on the instance — ringed.space has DeepL, so it can be
  verified. Derived task: expand the README — state in English, for
  operators, which features depend on instance configuration and what they
  need, and decide and align how the UI behaves on an instance without it)
- "Show more" folding for long posts (akkoma-fe shows "Show more" past a
  max-height. Whether the CW toggle can carry "fold on height overflow" is
  considered at implementation time. Unfolding must keep the CW's proven
  "toggling does not shift the scroll position")
- Parallelize older fetches per anchor — today requests from several
  GapMarkers / sentinels are drained serially through one queue, and
  waiting for another anchor to finish is noticeable. Parallelizing means
  redesigning the merge path of `appendOlder` (an earlier response may
  absorb the anchor's target segment) and where `exhausted` belongs, so
  decide after dogfooding shows how often waiting on another gap actually
  hurts.
