import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

// Standalone config (not merged with vite.config.ts): tests never need the
// dev proxy, and keeping them apart means the proxy's env loading can't leak
// into test runs. Suites run in vitest's default node environment unless they
// opt in per file via @vitest-environment — happy-dom, or jsdom where
// DOMPurify requires it (ADR-0009).
export default defineConfig({
  plugins: [
    solid({
      // Templates keep their attribute quotes in tests only. happy-dom (21.0.4)
      // reads the compiler's unquoted `<a href=/>` as a self-closing tag and
      // drops the value, leaving `href=""`; browsers follow the HTML parsing
      // rules, where an unquoted value may contain `/`, so the production build
      // keeps the shorter form.
      solid: { omitQuotes: false },
    }),
  ],
  test: {
    // Deliberately no `environment` here, although "node" is vitest's own
    // default: @solidjs/vite-plugin reads an explicit "node" as a server-only
    // test setup and resolves @solidjs/web to its server build, under which
    // the per-file DOM suites cannot render.
    setupFiles: ["./vitest.setup.ts"],
    // Node 25+ defines its own global localStorage (undefined without
    // --localstorage-file), and vitest keeps that over happy-dom's.
    execArgv: ["--no-webstorage"],
    // @solidjs/vite-plugin adds the "browser" condition in test mode, which
    // vitest forwards to Node for external deps; @mswjs/interceptors maps its
    // node-only entries (e.g. ./ClientRequest) to null under it. Inlining both
    // moves msw's imports of those entries from Node's resolver to Vite's.
    server: { deps: { inline: ["msw", "@mswjs/interceptors"] } },
  },
});
