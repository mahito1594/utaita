# Roadmap

> The Japanese [PLAN.ja.md](./PLAN.ja.md) is the source of truth; this file
> is synced from it at phase boundaries.

## Goal

A modern web frontend for Akkoma, distributed as static files and served by the
instance itself (`$instance_static/frontends/<name>/<ref>`). Same-origin API
access is assumed; there is no instance picker. Development and dogfooding
happen against a reference instance, but nothing instance-specific is
hardcoded.

## Stack

- SolidJS + @solidjs/router, Vite, Panda CSS, Biome, pnpm
- API types generated from the instance-served OpenAPI spec (`/api/openapi`)
  via openapi-typescript, consumed with openapi-fetch — see [ADR-0002](./adr/0002-api-client.md)
- Data fetching via @solidjs/router's data primitives (`query`/`createAsync` +
  route `preload`); timeline infinite scroll hand-rolls cursor page
  accumulation — see [ADR-0004](./adr/0004-data-fetching.md)

## Current status

- [x] Research: Akkoma API surface, auth, streaming, frontend deployment
- [x] Research: prior art (Elk, Phanpy, Soapbox, pleroma-fe) and SolidJS ecosystem
- [x] Validated codegen from the reference instance spec (173 paths, 79 schemas)
- [x] Phase 0 complete (2026-07-06)
- [x] Phase 1 complete (2026-09-21). Done condition and stories in
      [stories.md](./stories.md). Notifications moved to Phase 2 — read
      tracking needs a write scope (rationale at the top of the Phase 2
      section in stories.md). Decisions: ADR-0007 / 0011 / 0013 / 0014 / 0015
      and the ADR-0004 amendment. The minimal Phase 3 slice (`pnpm build` →
      a zip in the `frontends/utaita/<ref>` layout → manual install on the
      reference instance → switching one's own `preferred_frontend`) was
      pulled forward to close Phase 1, so the done condition's "real phone"
      and "a day without pleroma-fe" were measured in production. CI and
      release automation stay in Phase 3
- [ ] Phase 2 kickoff. A one-off review comes first: a mechanical audit
      (knip / jscpd / cccc), then an architecture review. Findings go to
      issues

## Phase 0 — Foundation

- [x] Commit `openapi.json`; add a pnpm script to fetch the spec and regenerate
      types (generated types committed too; source URL via env — ADR-0002 amendment)
- [x] openapi-fetch client wrapper (`Result<T, ApiError>` based —
      [ADR-0008](./adr/0008-api-errors-as-values.md); auth header injection is
      Phase 1, 401 already expressed as a value)
- [x] Vite dev proxy (`/api`, `/oauth`, `/nodeinfo` → reference instance,
      server-side token injection — ADR-0006 implemented)
- [x] Establish solid-router data-primitive usage (`query`/`createAsync`);
      entities/pages directory layout ([ADR-0010](./adr/0010-directory-structure.md);
      errors travel to the UI as values — ADR-0008 amendment)
- [x] Design tokens in Panda (palette, typography, spacing, radius. Light theme
      only — dark mode rejected for a personal-use client; rationale in
      [design/tokens.md](./design/tokens.md))
- [x] Rough wireframes for the two highest-impact pieces: app shell and status card
      ([app-shell](./design/app-shell-20260705.html), [status-card](./design/status-card-20260705.html))

Learning goals: OpenAPI-driven development; how Akkoma advertises its API.

## Phase 1 — Read-only MVP

Make it the client you open every day, before it can write anything.

- [x] OAuth login (dynamic app registration, see [ADR-0003](./adr/0003-oauth.md))
      and session handling. Sign-in gates only the timelines; shared links
      are readable anonymously
      ([ADR-0015](./adr/0015-sign-in-gates-only-personal-surfaces.md))
- [x] Timelines: home / local / bubble (Akkoma-specific) / federated, with
      infinite scroll and manual refresh for new posts
- [x] Status card: sanitized HTML content, custom emoji, media attachments,
      CW/sensitive handling, emoji reactions display, boost display, read-only
      polls and link previews
- [x] Thread (conversation tree) view ([ADR-0014](./adr/0014-thread-view.md).
      An unfetched parent is fetched by an explicit action, not resolved
      automatically — ADR-0011 amendment)
- [x] Profile page (header, statuses/replies/media tabs, relationship state)

Learning goals: OAuth2 authorization code flow by hand; cursor pagination
(`max_id`/`min_id`, Link header, 128-bit lexically sortable IDs); how API
responses map to ActivityPub activities (boost = `Announce`, favourite =
`Like`, emoji reaction = `EmojiReact`); visibility as AP addressing
(`to`/`cc`, followers collection, Akkoma's `local` scope); federation
artifacts visible in the UI (missing `blurhash`/`meta` on remote images,
the bubble timeline's notion of neighbor instances).

## Phase 2 — Writing

- [ ] Notifications (with read tracking; tolerate unknown types such as
      `pleroma:emoji_reaction`, `move`. Start right after the token scope
      widens to `read write` — every API that marks notifications read needs a
      write scope. Moved from Phase 1)
- [ ] Compose: text, CW, visibility (including Akkoma's `local`), custom emoji autocomplete
- [ ] Media upload with alt text (kept separate — deceptively large)
- [ ] Favourite / boost / bookmark / emoji reaction
      (`PUT /api/v1/pleroma/statuses/:id/reactions/:emoji`)
- [ ] Follow management
- [ ] Search (v2)

Learning goals: WebFinger (`@user@host` resolution), nodeinfo; idempotency and
optimistic updates against a federated backend.

## Phase 3 — Production deployment

- [ ] Build artifact layout for `frontends/<name>/<ref>`; release zip
- [ ] Staged rollout via `preferred_frontend`, then switch `primary` — see [ADR-0005](./adr/0005-deployment.md)
- [ ] CI: check, typecheck, build, release artifact

Learning goals: Akkoma operations; how an instance serves multiple frontends.

## Phase 4 — Beyond

- Streaming API (WebSocket `/api/v1/streaming`, reconnect/backoff design)
- Drafts (IndexedDB), lists, filters, list virtualization if needed
- Differentiating UX (e.g. catch-up view à la Phanpy), i18n (including the
  redesign of the card time display and a time zone setting — see the
  stories Icebox), a11y polish, PWA

Learning goals: realtime over Phoenix-backed WebSockets; offline-first storage.

## Akkoma-specific pitfalls

- The API is roughly Mastodon 2.7.2 plus extensions; newer Mastodon APIs may
  not exist. The instance-served spec is the source of truth.
- Several endpoints return stub values (`/api/v1/trends`, `/api/v1/suggestions`
  → `[]`; `/api/v1/featured_tags` → 404).
- `pleroma.content` / `pleroma.spoiler_text` are maps keyed by MIME type
  (multiple source formats: Markdown, MFM, …).
- Notifications include non-Mastodon types; never crash on unknown types.
- Remote attachments may lack `blurhash` / `meta` / focal point.
- Unauthenticated responses differ per endpoint: the home timeline answers 403
  `{"error": "Invalid credentials."}` while public answers 401 `{"error":
  "authorization required for timeline view"}`. Testing only for 401 misses
  the auth requirement.
- A reply whose parent is not in the local database carries the placeholder
  string `"_"` in `in_reply_to_id` instead of a real id (`in_reply_to_account_id`
  likewise). The real parent is only in `akkoma.in_reply_to_apid` (the AP
  URI). There is a path via `/api/v2/search` with `resolve=true` to have the
  server fetch it, then refetch the context (measured 2026-07-07; how far up
  the thread resolve walks is unverified). One resolve takes around 2.6
  seconds (measured 2026-08-09, 2 samples).
- **The ancestors / descendants split in `/api/v1/statuses/:id/context` cannot
  be trusted.** A parent fetched later via resolve lands on the child's
  `descendants` side (measured 2026-08-09, reproduced 2/2). The child's
  `in_reply_to_id` does change to the real id, so the link itself is there.
  Take the union of ancestors + descendants + subject, build the tree from
  `in_reply_to_id` alone, and derive ancestors / descendants client-side.
- **A status's `pinned` is always present, whoever the viewer is.** Contrary to
  the spec's "present only when pinnable", `pin_data/2` in `StatusView` looks
  at the author's `pinned_objects`, not the viewer (confirmed in the Akkoma
  source 2026-09-13; an anonymous fetch returns `pinned: true` too). It
  cannot be used as an owner check.
- **A remote account's pinned posts exceed `max_pinned_statuses`.** The
  default of 1 caps local pin actions; the featured collection that arrives
  over federation is imported as is (measured 2026-09-13: 3 on a misskey.io
  account). `?pinned=true` is ANDed with `exclude_replies` / `only_media`,
  and pagination works as usual.
- **Lexical id order matches chronological order only for posts that arrive
  through a timeline.** Flake ids follow insertion order into the local
  database, so an old post fetched later gets a newer id (measured
  2026-08-09: a parent whose `created_at` is 1–2 minutes older has a larger
  id than its child). Sort threads by `created_at`. Pagination's reliance on
  id order (segment merging, ADR-0004 amendment) is server-side ordering and
  is unaffected.
- Pagination info is in the `Link` header only (not in the response body).
  `limit` is clamped to 40 whatever is requested (measured 2026-07-07).
- Ids of statuses and the like are fixed-length 18-character base62 flake
  ids whose lexical order matches chronological order (newer is larger;
  measured 2026-07-20: on a real page of 40, descending lexical id order =
  descending `created_at`, all ids 18 characters). Timeline segment merging
  and deduplication (ADR-0004 amendment) and the id design of test fixtures
  depend on this property.
- Emoji reactions: a Unicode emoji has a null `url`; a remote custom emoji has
  `name` in `shortcode@host` form and the image URL in `url`. Forgetting the
  null branch breaks rendering. The same array arrives twice, as top-level
  `emoji_reactions` and as `pleroma.emoji_reactions` (measured 2026-07-07).
- The instance-served spec lags behind real responses in places:
  `Attachment.blurhash` / `Attachment.meta` and the `url` / `account_ids` of
  emoji reactions are absent from the spec but present in practice (confirmed
  2026-07-13). Fields missing from the generated types are covered by
  boundary parsing (`in` narrowing). Conversely, a poll's `voted` /
  `own_votes` are nullable in the spec but the keys are absent entirely when
  unauthenticated.
- Custom emoji are delivered as `:shortcode:` text inside the `content` HTML
  (not turned into `<img>`; measured 2026-07-13). The client substitutes them
  from the `emojis` array.
- The server appends an RE: link to a quote post's `content` as
  `<span class="quote-inline">` (absent from the author's source). Strip it
  only when rendering the quote card (ADR-0007).
- **`/api/v1/accounts/:id/followers` and `/following` accept flake ids only**
  (`assign_account_by_id` → `User.get_cached_by_id`). The nickname that
  `/accounts/:id` and `/accounts/:id/statuses` accept is a 404 there
  (measured 2026-09-13). Pagination uses the other account's own id as
  `max_id` (the Link header's next likewise). A private list
  (`pleroma.hide_follows` / `hide_followers`) answers 200 with `[]` to
  everyone but the owner. `following_count` / `followers_count` become 0
  only when both flags are set; with `hide_*_count` alone the real number
  arrives — look at the flags, not the values.
- **`/statuses/:id/favourited_by`, `/reblogged_by` and
  `/pleroma/statuses/:id/reactions` do not paginate** (`status_controller.ex`
  pulls every ap_id of likes / announcements with `Repo.all` and never calls
  `add_link_headers`; `emoji_reaction_controller.ex` likewise. Confirmed in
  the Akkoma source 2026-09-13). `limit` / `max_id` are ignored and
  everything arrives in one response. Responses for a status that exists
  but is invisible are inconsistent: favourited_by / reblogged_by answer
  **404**, reactions answers **403**. **A nonexistent id answers `200 []` on
  all three** (`Activity.get_by_id_with_object` returns nil, the `with`
  falls through to `json(conn, [])`. Confirmed 2026-09-19 with an anonymous
  curl and the Akkoma source). On an instance with `show_reactions: false`,
  favourited_by and reactions answer `200 []` (reblogged_by is
  unconditional).
- **The `emoji_reactions` embedded in a status and
  `/pleroma/statuses/:id/reactions` have different shapes**: the embedded
  one has `account_ids` (an array of ids) only, the dedicated endpoint has
  `accounts` (an array of Account). Also, the spec's
  `EmojiReactionController.index` copies the parameter definition of
  `/reactions/{emoji}`, so the generated type demands an `emoji` that is not
  in the path. openapi-fetch only substitutes `{name}` placeholders present
  in the template, so passing an empty string is harmless
  (`src/pages/thread/who-lists-api.ts`).
- Akkoma answers Bearer-authenticated requests with an httpOnly session cookie
  (`Set-Cookie`). Through the dev proxy that cookie lands on localhost, so the
  browser stays authenticated even after the proxy stops injecting the token
  (measured 2026-07-06). Clear cookies when checking unauthenticated behavior
  in a browser; the same trap applies to logout verification.
- **The Bearer token is copied into the session cookie, and a request without
  an Authorization header is authenticated by that cookie.**
  `SetUserSessionIdPlug` stores the token in the session and `OAuthPlug`
  falls back to the session's token when none is in the params or headers
  (confirmed in the Akkoma source 2026-09-19). Production is same-origin
  too, so an "anonymous" fetch after logout or after a failed revoke would
  be authenticated. The API client sends no cookies (`credentials: "omit"`,
  `src/api/client.ts`). The OAuth form POSTs (`src/api/oauth.ts`) must not
  follow suit: the `/oauth/token` response also issues the cookie
  (`after_token_exchange`), and `/oauth/revoke` clears the session only when
  the cookie's token matches the one being revoked (`o_auth_controller.ex`).
- **Frontend routes must avoid prefixes Akkoma owns at the root** (measured
  2026-09-16 on ringed.space / Akkoma 3.20). Akkoma owns a wide space under
  `/users/:nickname` for actors: the feed redirect, `feed`, static-fe's
  `with_replies` / `media`, AP's `inbox` / `outbox` / `followers` /
  `following` / `collections/featured`, `statuses/:id`. Akkoma answers these
  itself even with `Accept: text/html`; they never reach the SPA's
  index.html. On top of that, in a route ending in `:param` Phoenix reads
  everything after the last dot as `_format`, so an acct in `user@host.tld`
  form at the end answers 406. The glob (`/*path`) fallback does not do
  this. **The dev proxy answers every path with index.html, so none of this
  is visible on localhost.** Root-owned prefixes in `router.ex` include `/`,
  `/@`, `/users`, `/notice`, `/objects`, `/activities`, `/tags`, `/web`,
  `/main`, `/auth`, `/inbox`, `/embed`, `/registration`, `/mailer`,
  `/akkoma`, `/relay`, `/internal`, `/nodeinfo`, `/proxy`, `/api`, `/oauth`,
  `/.well-known`. Before using a new prefix, confirm that
  `curl -s -o /dev/null -w "%{http_code} %{content_type}" -H "Accept: text/html" https://<instance>/<prefix>/...`
  returns index.html. This is why profiles live at `/accounts/:acct` (the
  profile story in stories.md).
- **A locally created quote post inherits the quoted post's context.**
  `CommonAPI.Utils.make_context/1` uses the `quote`'s context when there is
  no `in_reply_to`, and `/context` selects by context match and splits into
  ancestors / descendants by id order alone (it never looks at
  `in_reply_to`). As a result the quote's `/context` contains the quoted post
  and its whole thread, and the quoted post's `/context` contains the quote
  and its replies, with no reply chain between them (confirmed in the Akkoma
  source 2026-09-16). The inheritance happens on the instance that created
  the post: a receiving instance does not rebuild the context from
  `quoteUri`, but it keeps the `context` of the object as delivered
  (`Transmogrifier.fix_context/1`), so the same contamination arrives from
  remote quotes made on Akkoma / Pleroma instances. Do not filter on
  local-only. Thread reconstruction drops detached chains that connect only
  through a quote (thread-tree.ts).
  - In `make_context/1` the `in_reply_to` clause comes before the `quote`
    clause. A quote that is also a reply inherits the reply target's
    context, so the inheritance happens **only for non-reply quotes**. If the
    quoting post is a reply, its quote link must not be counted as evidence
    of a mixed context.
  - When the viewer mutes / blocks the quoted post's author (or the quoted
    post is invisible), `maybe_render_quote` returns nil and `quote` is null,
    but `quote_id` stays (`status_view.ex`). Follow quote relationships via
    `quote_id`. When the quoted post is not in the database, `quote_id` is
    the ghost `"_"`, which points at no post.
- **Responses to anonymous requests vary with visibility.** With
  `instance.public: true` (the default), public / unlisted statuses,
  `/context`, accounts, status lists, follow lists and the who-lists answer
  200; a private / direct status answers **404** (not 401 / 403 —
  `visible_for_user?` is false for a nil user). `verify_credentials` and
  `/accounts/relationships` answer 403. With `instance.public: false`,
  `/context` answers a blanket 403 regardless of visibility (`show` still
  works). Measured 2026-09-16 on ringed.space. The frontend does not hide
  anything based on visibility; it follows the response (ADR-0015).
- **Notification ids are integer sequences, not flake ids** (the default
  primary key of the `notifications` table, stringified by
  `notification_view.ex`). "Lexical order is chronological order" is a
  property of status flake ids; compare a notification read boundary
  numerically.
