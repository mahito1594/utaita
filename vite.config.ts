import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => {
  // Loaded without the VITE_ prefix on purpose: these values are used only
  // here, server-side, and must never reach the client bundle (ADR-0006).
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.DEV_INSTANCE_URL;
  // Scaffolding until OAuth lands in Phase 1; delete outright then (ADR-0006).
  const entry = {
    target,
    changeOrigin: true,
    ...(env.DEV_ACCESS_TOKEN && {
      headers: { Authorization: `Bearer ${env.DEV_ACCESS_TOKEN}` },
    }),
  };
  return {
    plugins: [solid()],
    server: target
      ? { proxy: { "/api": entry, "/oauth": entry, "/nodeinfo": entry } }
      : undefined,
  };
});
