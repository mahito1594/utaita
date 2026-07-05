// Fetches the OpenAPI spec from the dev instance and writes it to
// openapi.json at the repository root. The instance URL comes from
// DEV_INSTANCE_URL (.env.local, untracked) so no instance-specific value
// is hardcoded in the repository — see ADR-0002.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const instanceUrl = process.env.DEV_INSTANCE_URL;
if (!instanceUrl) {
  console.error(
    "DEV_INSTANCE_URL is not set. Put it in .env.local (see .env.example).",
  );
  process.exit(1);
}

const specUrl = new URL("/api/openapi", instanceUrl);
const response = await fetch(specUrl);
if (!response.ok) {
  console.error(
    `GET ${specUrl} failed: ${response.status} ${response.statusText}`,
  );
  process.exit(1);
}

const spec = await response.json();
const outPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
// Stable pretty-printing keeps regeneration diffs reviewable.
await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(
  `Wrote ${outPath} (Akkoma ${spec.info?.version ?? "unknown version"})`,
);
