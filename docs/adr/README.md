# Architecture Decision Records

Short records of decisions with lasting consequences. One file per decision,
numbered, never rewritten — superseded ADRs get a new ADR pointing back.

Template:

```markdown
# NNNN: Title

- Status: draft | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## References
```

| ADR | Title |
| --- | --- |
| [0001](./0001-scope.md) | Instance-served generic Akkoma frontend, read-only-first MVP |
| [0002](./0002-api-client.md) | Generate the API client from the instance OpenAPI spec |
| [0003](./0003-oauth.md) | OAuth via dynamic app registration; phased token scopes; no PKCE available |
| [0004](./0004-data-fetching.md) | Server state via solid-router primitives; hand-rolled cursor pagination |
| [0005](./0005-deployment.md) | Staged rollout via `preferred_frontend` |
| [0006](./0006-dev-token-injection.md) | Dev access token is injected by the Vite proxy, discarded when OAuth lands |
| [0007](./0007-quote-posts-phase1-scope.md) | (draft) Whether quote posts are in the Phase 1 status card scope |
| [0008](./0008-api-errors-as-values.md) | API errors are values — Result-based wrapper over openapi-fetch |
