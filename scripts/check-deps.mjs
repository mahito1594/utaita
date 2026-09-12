// Validates `depcruise --output-type json` read from stdin. dependency-cruiser
// passes without a usable TypeScript compiler (TS files are skipped, only a
// warning is printed), so that case must fail here instead.
import { json } from "node:stream/consumers";

// Not readFileSync(0): a pipe on stdin can be non-blocking and throw EAGAIN.
const { summary } = await json(process.stdin);
const typescript = summary.environment.transpilersFound.find(
  (t) => t.name === "typescript",
);

if (!typescript?.available) {
  console.error(
    `dependency-cruiser has no usable TypeScript compiler (needs ${typescript?.version ?? "typescript"})`,
  );
  process.exitCode = 1;
} else if (summary.totalCruised === 0) {
  console.error("dependency-cruiser cruised no modules");
  process.exitCode = 1;
}
