# 0009: Testing strategy — classical school, MSW as the sole mock boundary

- Status: accepted
- Date: 2026-07-05

## Context

No test infrastructure exists yet; app code beyond the API client is about
to be written, so this is the moment to fix the strategy rather than
retrofit one. Two schools of unit testing frame the choice: the London
school (unit = a class; mock every collaborator) and the classical school
(unit = an independently runnable test; mock only out-of-process shared
dependencies, verify observable behavior). The classical school matches
this project's FP stance ([ADR-0008](./0008-api-errors-as-values.md)): the
ideal test subject is a pure function needing no mocks at all, so the
design pressure goes into pushing side effects to the edges instead of
into building mock machinery.

This project has exactly one out-of-process dependency: the same-origin
Akkoma server. MSW intercepts fetch at the network level, so tests can run
the real openapi-fetch client, the real Result wrapper, and the real
components against a faked server — the classical prescription with no
code changes.

Alternatives considered and rejected:

- **Interface-separated API layer with injected mocks**: a legitimate seam,
  but everything below it (URL construction, error-status mapping, the
  Result wrapper) escapes testing — precisely the code where bugs the type
  checker cannot catch live. Worse, every hand-written mock embeds an
  unverified assumption about API behavior; tests pass while integration
  breaks. MSW centralizes those assumptions as HTTP responses checkable
  against the OpenAPI schema.
- **DI container / injection machinery**: the API implementation will only
  ever be one thing (same-origin Akkoma, per [ADR-0001](./0001-scope.md)),
  so an interface plus resolution layer is indirection with no second
  implementation — against the rule of three. DI stays at "pass arguments
  from the composition root" (`src/index.tsx`); no framework.
- **Vitest Browser Mode**: stable since Vitest 4, but Solid integration
  rests on an unofficial single-maintainer package (`vitest-browser-solid`)
  while the official Solid testing guide documents only the simulated-DOM
  path. Revisit if Solid adopts Browser Mode officially.

## Decision

Three layers, thickest where mocks are unnecessary:

1. **Pure logic** (tree building, formatting, Result transforms): plain
   Vitest, no DOM, no mocks. TDD runs here. Wanting a hand-written mock is
   treated as a smell — extract the pure part instead.
2. **Page-level integration** (the workhorse): Vitest + happy-dom +
   `@solidjs/testing-library` + MSW (`setupServer`). Render a route, drive
   it with user-event, assert what the user sees. Tests target observable
   behavior, not component internals, so internal refactoring does not
   break them.
3. **E2E** (Playwright): none for now. After the OAuth login flow
   stabilizes, a handful of critical-path smoke tests at most — and never
   against the production instance.

Supporting choices:

- **happy-dom** is the default environment (markedly faster than jsdom;
  proven in another Solid project of the author's). Escape hatch: an
  unexplained failure is first suspected to be a DOM-implementation
  difference — flip that file with `// @vitest-environment jsdom`; if
  happy-dom failures recur, fall back to jsdom globally (the officially
  documented path). Neither implements layout; size/position assertions
  belong to E2E.
- **No coverage targets.** Numeric goals invite assertion-thin tests that
  mirror the implementation. Measurement (`--coverage`) stays available as
  visibility; the qualitative agreement is "pure logic thick, pages by
  main scenarios".
- **openapi-msw** (typed MSW handlers from the generated `paths` type) is
  the favored candidate for handler typing, pending a small PoC against
  this repo's generated types — compatibility with openapi-typescript 7.x
  is not documented upstream. Falling back to hand-typed plain MSW
  handlers is cheap.

## Consequences

- The only test double in the codebase is the MSW handler set; API-shape
  assumptions live there and nowhere else.
- Components stay mock-free by construction: data-shaping logic is
  extracted into pure functions and fed via props/arguments.
- Vitest config needs `resolve.conditions: ["development", "browser"]`
  (Solid's conditional exports; per the official testing guide).
- Setup checklist doubles as the PoC: the first page test (user-event
  interaction under happy-dom, openapi-msw handler) validates both open
  points at once.

## References

- Terminology (classical vs London): Vladimir Khorikov, *Unit Testing
  Principles, Practices, and Patterns*
- Guiding principle: Kent C. Dodds, "The more your tests resemble the way
  your software is used, the more confidence they give you"
- Solid official testing guide: https://docs.solidjs.com/guides/testing
- MSW Node integration: https://mswjs.io/docs/integrations/node
- openapi-msw: https://github.com/christoph-fricke/openapi-msw
