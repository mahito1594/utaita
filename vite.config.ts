import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  // Loaded without the VITE_ prefix on purpose: the value is used only
  // here, server-side, and must never reach the client bundle (ADR-0006).
  // Destructured: satisfies both noPropertyAccessFromIndexSignature (no dot
  // access on an index signature) and Biome's useLiteralKeys (no bracket).
  const env = loadEnv(mode, process.cwd(), "");
  const { DEV_INSTANCE_URL: target } = env;
  const entry = target ? { target, changeOrigin: true } : undefined;
  return {
    plugins: [solid()],
    ...(entry
      ? {
          server: {
            proxy: {
              "/api": entry,
              // RegExp on purpose: a plain "/oauth" key prefix-matches the
              // SPA's own /oauth-callback route and would forward the OAuth
              // return leg to the instance.
              "^/oauth(/|$)": entry,
              "/nodeinfo": entry,
            },
          },
        }
      : {}),
  };
});
