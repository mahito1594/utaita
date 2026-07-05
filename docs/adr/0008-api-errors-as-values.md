# 0008: API errors are values — Result-based wrapper over openapi-fetch

- Status: accepted
- Date: 2026-07-05

## Context

The project aims to practice functional programming where it pays off, while
keeping external dependencies minimal. That raised the question of whether
openapi-fetch (chosen in [ADR-0002](./0002-api-client.md)) should be replaced
by a hand-rolled client.

Investigation showed openapi-fetch is already close to the FP requirement:
HTTP errors (4xx/5xx) come back as values in `{ data, error, response }` —
only network-level failures throw. Its sole runtime dependency is a
types-only package, and it is developed in the same repository as
openapi-typescript, so compatibility with the codegen output is maintained
upstream.

Alternatives considered and rejected:

- **Hand-rolled generic client** over the generated `paths` type: the
  runtime is trivial, but the type-level plumbing (path-indexed inference of
  params/body/response) is exactly what openapi-fetch encapsulates. A subtle
  mistake produces types that compile but disagree with reality — worse than
  the dependency it saves.
- **Per-endpoint hand-written functions**: viable in volume (~10–15
  endpoints for Phase 1) but the URL-string-to-type binding becomes
  convention, unchecked by the compiler, weakening the "API shapes are
  centralized from day one" agreement.
- **Other generated clients** (hey-api, oazapfts, Zodios): swap one
  dependency for another without any functional gain.
- **Effect**: the only option that is genuinely more functional, but a
  paradigm-and-dependency commitment that contradicts the minimal-deps
  stance.

The conclusion: the place to practice FP is not the transport layer but the
error representation above it.

## Decision

Keep openapi-fetch as transport. The wrapper (`src/api/client.ts`) folds both
failure shapes — HTTP errors as values, network failures as exceptions — into
`Result<T, ApiError>` at the API boundary. No exception and no raw
`{ data, error }` pair crosses out of `src/api/`.

- `ApiError` is an ADT: `network(cause)` | `http(status, message?)`, where
  `message` comes from Akkoma's `{ "error": string }` body when present.
  A 401 is represented faithfully; reacting to it is the caller's concern.
- `Result` is a hand-rolled minimum (`src/api/result.ts`): the type and the
  `ok`/`err` constructors only. Combinators are added at the third caller
  that needs them (rule of three); if they accumulate, switching to
  neverthrow is a contained change.

## Consequences

- Callers pattern-match on `Result`/`ApiError`; there is no try/catch in UI
  code for API calls.
- openapi-fetch remains replaceable within `src/api/` — nothing outside it
  sees the library's calling convention.
- `Result` lives in `src/api/` until a third non-API use appears, then moves
  to a shared module.

## Amendment (2026-07-05): how the UI consumes error values

Session B forced the question this ADR left open: solid-router's documented
idiom is throw-plus-ErrorBoundary, which collides with errors-as-values.
Resolved as a role split:

- **Suspense means loading, Result means failure.** `createAsync` may
  suspend while a query resolves, but the resolved value is always
  `Result<T, ApiError>`; components branch on it in JSX. A 401 is the
  timeline's normal answer until auth exists, and a network failure is
  everyday weather on mobile — both are render branches (`switch` on
  `error.kind`), not exceptions. `throw` is reserved for genuine bugs; one
  ErrorBoundary in the app shell is the last resort, and API failures never
  reach it.
- **Recovery is always `revalidate`.** The query cache stores whatever the
  function returns, so an `Err` is cached like an `Ok` — accepted, not
  fought. A cached 401 stays true until auth state changes (then revalidate
  by prefix); a cached network error is behind a retry button that calls
  `revalidate(key)`. Revalidation runs in a transition, so current UI holds
  during refetch.
- `network.cause` stays unclassified (`unknown`) until a UI needs to
  distinguish offline/timeout/DNS; refinement happens in `toResult` as new
  `kind`s, invisible to transport.

Rejected: a hybrid that throws "unexpected" errors (network) and keeps only
"expected" ones (4xx) as values — it blurs the type-level contract exactly
where mobile use makes network failure a first-class UI state.

## References

- Transport choice and codegen pipeline: [ADR-0002](./0002-api-client.md)
- openapi-fetch error semantics: https://openapi-ts.dev/openapi-fetch/
- Query cache and revalidate semantics: https://docs.solidjs.com/solid-router/reference/data-apis/query
