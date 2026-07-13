---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TypeScript design principles

## Parse, don't validate

Untrusted data (API responses, URL params, localStorage) is parsed exactly
once, at the boundary, into a typed value; inside the boundary the type is
trusted — no re-checking, no defensive narrowing. Existing consequences of
this principle: generated types from `openapi.json`, the `Result`-based
wrapper (ADR-0008), and the `no-as` GritQL plugin (an `as` assertion is a
claim the parser should have earned).

## Functional core / imperative shell

Decision logic lives in pure functions; side effects (fetch, storage,
navigation, DOM) stay in a thin shell around them. When logic inside a
component or effect grows branches, extract the branches into a pure
function rather than mocking the effect — this is why ADR-0009 tests pure
logic thickly with plain Vitest and reserves MSW for the HTTP boundary.
`src/app/oauth.ts` (pure) vs `src/app/session.ts` (shell) is the reference
example.

## Functional style

Prefer immutable data and expressions over mutation and statements. Errors
that callers must handle are values (`Result`), never thrown; exceptions are
not control flow. Model states so illegal combinations don't type-check
(discriminated unions over optional-field soup); prefer required-but-nullable
fields over optional ones when the value is always computed
(exactOptionalPropertyTypes makes the distinction real).
