import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

// Standalone config (not merged with vite.config.ts): tests never need the
// dev proxy, and keeping them apart means the proxy's env loading can't leak
// into test runs. Default environment stays node for pure-logic tests
// (ADR-0009); page tests opt into happy-dom per file via @vitest-environment.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    // Explicit, not a default: vite-plugin-solid silently injects
    // environment "jsdom" (not installed here) when this field is absent.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
