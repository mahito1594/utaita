// Enforces the one-way layer direction from ADR-0010 (app → pages →
// entities → api) and ADR-0012. Biome cannot do this job: its import rules
// glob-match the literal import specifier, so a relative `../status/...`
// between sibling entities is invisible to it.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "api-stays-leaf",
      comment: "src/api is the bottom layer; it must not know its consumers.",
      severity: "error",
      from: { path: "^src/api/" },
      to: { path: "^src/(entities|pages|app)/" },
    },
    {
      name: "entities-do-not-reach-up",
      severity: "error",
      from: { path: "^src/entities/" },
      to: { path: "^src/(pages|app)/" },
    },
    {
      name: "pages-do-not-reach-up",
      severity: "error",
      from: { path: "^src/pages/" },
      to: { path: "^src/app/" },
    },
    {
      name: "no-entity-sideways",
      comment:
        "Entities stay independent of each other; shared needs live in api " +
        "or a lower layer. $1 back-references the entity's own folder.",
      severity: "error",
      from: { path: "^src/entities/([^/]+)/" },
      to: { path: "^src/entities/", pathNot: "^src/entities/$1/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.app.json" },
    // Type-only imports must respect the same boundaries; without this they
    // vanish at compile time and would slip through.
    tsPreCompilationDeps: true,
  },
};
