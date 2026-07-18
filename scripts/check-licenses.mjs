// Validates a `pnpm licenses list --json` output file against an allowlist.
// Takes the JSON path as an argument rather than invoking pnpm itself, so
// this stays a pure, composable validator (fixture files, other package
// managers) — the pnpm invocation is composed in package.json.
import { readFileSync } from "node:fs";

const ALLOWED = new Set([
  // Permissive, MIT-compatible for a MIT-licensed bundle.
  "MIT",
  "MIT-0",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  // Dual licenses we accept — the MIT/permissive side is elected.
  "MIT OR Apache-2.0",
  "MIT OR CC0-1.0",
  "(MIT OR CC0-1.0)",
  // dompurify — Apache-2.0 elected (see commit history for Unit 2).
  "(MPL-2.0 OR Apache-2.0)",
]);

const path = process.argv[2];
if (!path) {
  console.error("usage: check-licenses.mjs <path-to-licenses.json>");
  process.exit(2);
}

const data = JSON.parse(readFileSync(path, "utf8"));

const disallowed = Object.entries(data).filter(([spdx]) => !ALLOWED.has(spdx));

if (disallowed.length > 0) {
  console.error("disallowed licenses found:");
  for (const [spdx, pkgs] of disallowed) {
    console.error(`  ${spdx}`);
    for (const pkg of pkgs) {
      const versions = pkg.versions?.join(",") ?? pkg.version ?? "?";
      console.error(`    - ${pkg.name}@${versions}`);
    }
  }
  process.exit(1);
}

const total = Object.values(data).reduce((n, pkgs) => n + pkgs.length, 0);
console.log(
  `ok: ${total} packages, ${Object.keys(data).length} licenses matched`,
);
