# 0012: Enforce directory boundaries with dependency-cruiser

- Status: accepted
- Date: 2026-07-13

## Context

ADR-0010 fixed a one-way dependency direction (`app → pages → entities →
api`) and forbade sideways imports between entities, but nothing enforced it
— compliance rested entirely on review discipline. A 2026-07-13 audit of
what is written down versus what is machine-checked flagged this as the
largest gap.

Biome was the obvious zero-cost candidate (already a dev dependency) and was
tried first. Its `noRestrictedImports` rule, scoped per directory via
`overrides`, does catch reverse-direction imports. It cannot catch sideways
imports between entities: the rule glob-matches the literal import specifier,
and a relative `../status/StatusCard` between siblings contains no substring
identifying the layer. The only workaround is enumerating every sibling
entity name in every entity's override — an O(N²) configuration that must be
edited whenever an entity is added, and that false-positives on common
directory names.

This project avoids new dependencies for application code, but the standing
criterion is that a dependency must do a job the standard stack cannot — and
the user has clarified that development-only tooling is acceptable, even
welcome, when it lowers the complexity budget of production code.

## Decision

Add `dependency-cruiser` as a dev dependency and encode the ADR-0010 rules
in `.dependency-cruiser.cjs`, run as `pnpm check:deps` locally and in CI.

dependency-cruiser matches rules against resolved file paths, not import
specifiers, and supports back-references from `from.path` capture groups in
`to.pathNot`. The entire "entities stay independent of each other" rule is
one entry that needs no updating when entities are added:

```js
{ from: { path: "^src/entities/([^/]+)/" },
  to: { path: "^src/entities/", pathNot: "^src/entities/$1/" } }
```

The config also forbids the three reverse directions and dependency cycles,
and sets `tsPreCompilationDeps: true` so type-only imports respect the same
boundaries.

## Consequences

- ADR-0010's structure is now machine-checked; a boundary violation fails
  `pnpm check:deps` and CI rather than relying on review attention.
- One more dev dependency (~14 transitive packages) to keep current. It is
  isolated from the production bundle and can be dropped without touching
  `src/` if it ever goes unmaintained.
- Biome and dependency-cruiser split lint duties: Biome owns code-level
  rules (including the `no-as` GritQL plugin), dependency-cruiser owns
  module-graph rules. Boundary rules must not be duplicated on the Biome
  side.

## Amendment (2026-09-12): TypeScript 7 and the empty cruise

dependency-cruiser parses TypeScript through whatever `require("typescript")`
resolves, and only accepts `>=2 <7`. After the project moved to TypeScript 7
(for its native type checker), `pnpm check:deps` found no usable compiler,
cruised 0 modules, printed a `missing-typescript-transpiler` warning — which
is fixed at severity `warn` — and exited 0. The check passed in CI while
checking nothing. Upstream support waits on a public TypeScript 7 compiler
API, with no date.

- **dependency-cruiser gets its own TypeScript 6.** `packageExtensions` in
  `pnpm-workspace.yaml` adds `typescript: ^6` as a dependency of
  dependency-cruiser only. The project's `typescript` stays on 7; nothing
  else changes which compiler it sees.
- **A missing compiler fails.** After the usual `depcruise src` run,
  `check:deps` cruises again with the JSON reporter and pipes it into
  `scripts/check-deps.mjs`, which exits non-zero unless the summary lists
  TypeScript as an available transpiler and at least one module was
  cruised. Checking the transpiler, not just the module count, keeps a stray
  `.js` file in `src/` from masking a skipped TypeScript tree. The second
  run costs under a second and leaves the `err` reporter's output (cycle
  paths included) untouched.
- **Removal is tied to the upstream release.** Renovate does not see
  `packageExtensions`, so a `renovate.json` rule takes dependency-cruiser
  out of the non-major group, turns off its automerge, and adds a PR note:
  once a release supports TypeScript 7, delete the `packageExtensions`
  entry. Until then the `^6` range moves only by hand; TypeScript 6 is the
  last JavaScript-based line, so little is lost.

Options considered:

- Aliasing `typescript` to `@typescript/typescript6` (the side-by-side setup
  from the TypeScript 7 announcement, suggested upstream) — rebinds
  `typescript` for every tool and the editor, not just dependency-cruiser.
- Staying on TypeScript 6 — dependencies are kept on their latest majors so
  upgrades never pile up.
- dependency-cruiser's `swc` parser — experimental, marked for removal, and
  not documented to support `tsPreCompilationDeps`.

## References

- [ADR-0010](./0010-directory-structure.md) — the boundary rules being
  enforced
- Convention audit discussion, 2026-07-13 (Biome limitation verified
  empirically against Biome 2.5.2)
- [sverweij/dependency-cruiser#1069](https://github.com/sverweij/dependency-cruiser/issues/1069),
  [#1048](https://github.com/sverweij/dependency-cruiser/issues/1048) —
  TypeScript 7 support waits on a public compiler API
- [Announcing TypeScript 7.0 — running side by side with TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)
