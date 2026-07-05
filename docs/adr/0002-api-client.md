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

## Amendment (2026-07-05)

Two refinements from Phase 0 session A:

- The generated types (`src/api/schema.d.ts`) are committed alongside
  `openapi.json`. Being in the same commit is what guarantees spec and types
  agree; regeneration shows API changes as a reviewable diff at both the
  spec and the type level; and a fresh clone builds without network access.
- The regeneration script reads its source URL from an env var
  (`DEV_INSTANCE_URL` in `.env.local`, untracked) rather than hardcoding an
  instance. The committed spec contains no instance-specific values
  (verified: `servers` is empty, `info.version` carries the Akkoma release
  version), so the artifact describes an Akkoma version, not a particular
  server.

## References

- https://docs.akkoma.dev/stable/development/API/differences_in_mastoapi_responses/
- https://github.com/h3poteto/megalodon (Akkoma listed as unofficial)
