# Roadmap

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
- [ ] Phase 1 kickoff pending

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

- [ ] OAuth login (dynamic app registration, see [ADR-0003](./adr/0003-oauth.md)) and session handling
- [ ] Timelines: home / local / bubble (Akkoma-specific) / federated, with infinite scroll
- [ ] Status card: sanitized HTML content, custom emoji, media attachments,
      CW/sensitive handling, emoji reactions display, boost display
- [ ] Thread (conversation tree) view
- [ ] Profile page (header, statuses/replies/media tabs, relationship state)
- [ ] Notifications (read-only; tolerate unknown types such as `pleroma:emoji_reaction`, `move`)

Learning goals: OAuth2 authorization code flow by hand; cursor pagination
(`max_id`/`min_id`, Link header, 128-bit lexically sortable IDs); how API
responses map to ActivityPub activities (boost = `Announce`, favourite =
`Like`, emoji reaction = `EmojiReact`); visibility as AP addressing
(`to`/`cc`, followers collection, Akkoma's `local` scope); federation
artifacts visible in the UI (missing `blurhash`/`meta` on remote images,
the bubble timeline's notion of neighbor instances).

## Phase 2 — Writing

- [ ] Compose: text, CW, visibility (including Akkoma's `local`), custom emoji autocomplete
- [ ] Media upload with alt text (kept separate — deceptively large)
- [ ] Favourite / boost / bookmark / emoji reaction (`PUT /api/v1/pleroma/statuses/:id/reactions/:emoji`)
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
- Differentiating UX (e.g. catch-up view à la Phanpy), i18n, a11y polish, PWA

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
- Akkoma answers Bearer-authenticated requests with an httpOnly session cookie
  (`Set-Cookie`). Through the dev proxy that cookie lands on localhost, so the
  browser stays authenticated even after the proxy stops injecting the token
  (observed 2026-07-06). Clear cookies when checking unauthenticated behavior
  in a browser; the same trap applies to logout verification once OAuth lands.
