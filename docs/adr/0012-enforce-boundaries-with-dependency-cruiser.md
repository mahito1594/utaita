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

## References

- [ADR-0010](./0010-directory-structure.md) — the boundary rules being
  enforced
- Convention audit discussion, 2026-07-13 (Biome limitation verified
  empirically against Biome 2.5.2)
