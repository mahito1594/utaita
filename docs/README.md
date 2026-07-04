# docs

Development documentation for utaita, a modern web frontend for [Akkoma](https://akkoma.dev/).

utaita is designed to be served by an Akkoma instance itself via the
[frontends mechanism](https://docs.akkoma.dev/stable/configuration/frontend_management/),
so it always talks to the same-origin API. No instance-specific behavior may be
hardcoded; any Akkoma instance should be able to install it.

| Path | Contents |
| --- | --- |
| [PLAN.md](./PLAN.md) | Phase roadmap, current status, and learning goals per phase |
| [process.md](./process.md) | Phase lifecycle and session workflow |
| [stories.md](./stories.md) | User story backlog |
| `*.ja.md` | Japanese sources for PLAN and stories (source of truth; English synced at phase boundaries) |
| [adr/](./adr/) | Architecture Decision Records |
| [design/](./design/) | Design token decisions and wireframes |
