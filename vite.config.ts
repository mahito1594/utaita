import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  // Loaded without the VITE_ prefix on purpose: the value is used only
  // here, server-side, and must never reach the client bundle (ADR-0006).
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.DEV_INSTANCE_URL;
  const entry = { target, changeOrigin: true };
  return {
    plugins: [solid()],
    server: target
      ? {
          proxy: {
            "/api": entry,
            // RegExp on purpose: a plain "/oauth" key prefix-matches the
            // SPA's own /oauth-callback route and would forward the OAuth
            // return leg to the instance.
            "^/oauth(/|$)": entry,
            "/nodeinfo": entry,
          },
        }
      : undefined,
  };
});
