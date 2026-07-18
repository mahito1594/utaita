# utaita

A modern web frontend for [Akkoma](https://akkoma.social/), distributed as
static files and served by the instance itself from
`$instance_static/frontends/<name>/<ref>`. The API is always same-origin;
there is no instance picker.

Supported Akkoma version: **3.19.0** (the committed [openapi.json](./openapi.json)
was generated from it — see [ADR-0002](./docs/adr/0002-api-client.md)).

## Development setup

Requires Node 24 and pnpm (managed via [mise](https://mise.jdx.dev/)).

```bash
pnpm install
cp .env.example .env.local   # then fill in your dev instance
pnpm dev
```

The dev server proxies `/api`, `/oauth`, and `/nodeinfo` to
`DEV_INSTANCE_URL`, so the app talks to a real instance while staying
same-origin. If `DEV_ACCESS_TOKEN` is set, the proxy injects it server-side
as an `Authorization` header; the token never reaches the browser
([ADR-0006](./docs/adr/0006-dev-token-injection.md)). Leave it unset to
exercise the unauthenticated (401) paths.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with the instance proxy |
| `pnpm build` | Typecheck + production build |
| `pnpm check` / `pnpm check:fix` | Biome lint + format |
| `pnpm typecheck` | TypeScript only |
| `pnpm api:spec` | Refetch `openapi.json` from `DEV_INSTANCE_URL` |
| `pnpm api:types` | Regenerate `src/api/schema.d.ts` from `openapi.json` |

Both `openapi.json` and the generated types are committed; regenerate them
together so API changes show up as one reviewable diff.

## Documentation

- Roadmap and phase status: [docs/PLAN.md](./docs/PLAN.md)
- Decisions with lasting consequences: [docs/adr/](./docs/adr/)
- How we work: [docs/process.md](./docs/process.md)

## License

MIT — see [LICENSE](./LICENSE).

Third-party dependencies bundled into the production build are
attributed in `dist/THIRD_PARTY_LICENSES.md`, generated automatically
by Vite's `build.license` during `pnpm build`. `pnpm check:licenses`
guards CI against dependencies with licenses outside the permissive
allowlist.
