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
exercise the unauthenticated paths (401 or 403 — it differs per endpoint;
see the Akkoma pitfalls in [docs/PLAN.md](./docs/PLAN.md)).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server with the instance proxy |
| `pnpm test` | Run the test suite |
| `pnpm check` | Everything CI checks: Biome, TypeScript, module boundaries, licenses |
| `pnpm check:lint:fix` | Apply Biome's formatting and lint fixes |
| `pnpm build` | Production build |

`pnpm check && pnpm test && pnpm build` is exactly what CI runs, so green
locally is green there. `package.json` holds the rest — each part of `check`
on its own, `test:watch`, `preview`.

When the Akkoma API changes, `pnpm api:spec` refetches `openapi.json` from
`DEV_INSTANCE_URL` and `pnpm api:types` regenerates `src/api/schema.d.ts`
from it. Both files are committed; regenerate them together so API changes
show up as one reviewable diff.

## Documentation

- Roadmap and phase status: [docs/PLAN.md](./docs/PLAN.md)
- User stories, phase done conditions, and the Icebox: [docs/stories.md](./docs/stories.md)
- Decisions with lasting consequences: [docs/adr/](./docs/adr/)
- How we work: [docs/process.md](./docs/process.md)

## License

MIT — see [LICENSE](./LICENSE).

Third-party dependencies bundled into the production build are
attributed in `dist/THIRD_PARTY_LICENSES.md`, generated automatically
by Vite's `build.license` during `pnpm build`. `pnpm check:licenses`
guards CI against dependencies with licenses outside the permissive
allowlist.
