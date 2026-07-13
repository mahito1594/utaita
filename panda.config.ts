import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{js,jsx,ts,tsx}"],
  exclude: [],
  outdir: "styled-system",
  globalCss: {
    html: {
      // Light-only UI: keeps native widgets (scrollbars, form controls) light
      // even when the OS prefers dark. See docs/design/tokens.md.
      colorScheme: "light",
    },
    body: {
      bg: "bg.canvas",
      color: "text.default",
      fontFamily: "sans",
    },
  },
  theme: {
    extend: {
      // Anchor palette and derived shades; rationale and contrast results in
      // docs/design/tokens.md. Components must consume semantic tokens only.
      tokens: {
        colors: {
          chocolateCosmos: { value: "#451722" },
          dun: { value: "#C9BEA3" },
          jet: { value: "#333333" },
          amaranth: {
            DEFAULT: { value: "#A02C3F" },
            deep: { value: "#8A2536" },
          },
          cream: {
            50: { value: "#FAF8F3" },
            100: { value: "#F2EEE3" },
            200: { value: "#E3DCC9" },
          },
          sienna: {
            DEFAULT: { value: "#A0490F" },
            pale: { value: "#FBEADD" },
          },
          taupe: { value: "#6B6558" },
        },
      },
      semanticTokens: {
        colors: {
          bg: {
            // canvas = page, surface = cards; the page sits one paper-tone
            // below the cards so the column reads as sheets on a desk.
            canvas: { value: "{colors.cream.50}" },
            surface: { value: "{colors.white}" },
            subtle: { value: "{colors.cream.100}" },
            // Media-overlay scrim: near-black warmed toward the brand hue so
            // the lightbox stays in the palette (docs/design/tokens.md).
            backdrop: { value: "rgba(28, 16, 19, 0.92)" },
          },
          text: {
            default: { value: "{colors.jet}" },
            muted: { value: "{colors.taupe}" },
            brand: { value: "{colors.chocolateCosmos}" },
            onAccent: { value: "{colors.white}" },
          },
          accent: {
            default: { value: "{colors.amaranth}" },
            hover: { value: "{colors.amaranth.deep}" },
          },
          border: {
            default: { value: "{colors.cream.200}" },
          },
          error: {
            default: { value: "{colors.sienna}" },
            subtle: { value: "{colors.sienna.pale}" },
          },
        },
      },
    },
  },
});
