# 0002: Generate the API client from the instance OpenAPI spec

- Status: accepted
- Date: 2026-07-04

## Context

Akkoma serves an OpenAPI 3.0 spec of its own API at `/api/openapi` (verified
against the reference instance: 173 paths, 79 schemas, including all
Pleroma/Akkoma extensions). Existing client libraries fit poorly: masto.js
targets vanilla Mastodon and has no types for `pleroma.*`/`akkoma.*`
extensions; megalodon lists Akkoma only as unofficially supported. Codegen
with openapi-typescript was validated against the spec (clean run, ~19k lines
of types).

## Decision

Generate TypeScript types from the instance-served spec with
openapi-typescript and consume them with openapi-fetch behind a thin wrapper
(auth header injection, 401 handling). Commit both `openapi.json` and a
regeneration script so the spec version is explicit and reviewable.

## Consequences

- Akkoma extensions (emoji reactions, bubble timeline, frontend settings) are
  first-class and type-safe.
- Generated types are pinned to one Akkoma version; regeneration against a
  newer spec shows API changes as a reviewable diff. The supported Akkoma
  version should be stated in the README.
- No client library abstracts quirks for us: pagination, retries, and
  response differences from vanilla Mastodon are ours to handle (see
  PLAN.md pitfalls).

## References

- https://docs.akkoma.dev/stable/development/API/differences_in_mastoapi_responses/
- https://github.com/h3poteto/megalodon (Akkoma listed as unofficial)
