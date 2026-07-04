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
- [ ] Phase 0 in progress

## Phase 0 — Foundation

- [ ] Commit `openapi.json`; add a pnpm script to fetch the spec and regenerate types
- [ ] openapi-fetch client wrapper (base URL, auth header injection, 401 handling)
- [ ] Vite dev proxy (`/api`, `/oauth`, `/nodeinfo` → reference instance)
- [ ] Establish solid-router data-primitive usage (`query`/`createAsync`); feature-based directory layout
- [ ] Design tokens in Panda (palette, typography, spacing, radius, dark mode)
- [ ] Rough wireframes for the two highest-impact pieces: app shell and status card

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
- [ ] Minimal settings (theme toggle)

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
