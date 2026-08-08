import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Standalone config (not merged with vite.config.ts): tests never need the
// dev proxy, and keeping them apart means the proxy's env loading can't leak
// into test runs. Default environment stays node for pure-logic tests
// (ADR-0009); the tests that need a DOM opt in per file via
// @vitest-environment — happy-dom, or jsdom where DOMPurify requires it.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    // Load-bearing, not a restatement of vitest's own default:
    // vite-plugin-solid injects environment "jsdom" whenever this field is
    // absent. Since jsdom became a devDependency, dropping this would move
    // every suite to jsdom silently instead of failing on a missing package.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
