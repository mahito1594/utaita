# CLAUDE.md

## Project

A modern web frontend for Akkoma, distributed as static files and served by
the instance itself from `$instance_static/frontends/<name>/<ref>`. The API is
always same-origin; there is no instance-picker UI. Stack: SolidJS +
@solidjs/router, Vite, Panda CSS, Biome, pnpm. API types are generated from
the instance-served OpenAPI spec and consumed via openapi-fetch.

## Where things are documented

- Roadmap and phase status: [docs/PLAN.ja.md](docs/PLAN.ja.md) (Akkoma
  pitfalls are listed at the bottom)
- How we work (phase lifecycle, session ritual): [docs/process.md](docs/process.md)
- Decisions with lasting consequences: [docs/adr/](docs/adr/)
- Backlog and phase done conditions: [docs/stories.ja.md](docs/stories.ja.md)
- Design tokens rationale and wireframes: [docs/design/](docs/design/)

## Language convention (edit the right file)

- PLAN and stories are bilingual: the `.ja.md` file is the source of truth.
  Edit `.ja.md`; the English `.md` is synced only at phase boundaries.
- ADRs, READMEs, process.md, and this file are English-only.
- Discussion happens in chat (Japanese is fine); only outcomes are recorded.

## Commands

- `pnpm dev` — dev server; `pnpm build` — typecheck + production build
- `pnpm check` / `pnpm check:fix` — Biome lint + format
- `pnpm typecheck` — TypeScript only

## Working agreements that affect code

- Rule of three: write it concretely first; extract a shared abstraction (or
  a Panda recipe) only at the third occurrence.
- Exception — centralized from day one: API shapes (generated types from
  `openapi.json`), design tokens, auth header injection. Divergence there is
  a bug, not tolerable duplication.
- Commit messages carry the "why" of a change.

## Testing agreements ([ADR-0009](docs/adr/0009-testing-strategy.md))

- Mock only at the HTTP boundary, via MSW. No interface/DI indirection for
  testability; wanting a hand-written mock means pure logic should be
  extracted instead.
- Test observable behavior at page level (happy-dom +
  `@solidjs/testing-library`), not component internals. Pure logic is
  tested thickly with plain Vitest; no mocks, no DOM.
- No coverage targets. No E2E until the login flow stabilizes.
