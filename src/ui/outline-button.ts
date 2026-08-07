import { cva } from "../../styled-system/css";

// The app-wide outline-button shape; `tone` is the only variant axis —
// severity, carried entirely by border color. `_disabled` also matches
// `[aria-disabled=true]` in this project's Panda preset, so call sites
// using aria-disabled for focus retention get the busy look for free.
export const outlineButton = cva({
  base: {
    px: "3",
    py: "1",
    fontSize: "sm",
    borderWidth: "1px",
    borderRadius: "md",
    bg: "bg.surface",
    cursor: "pointer",
    _hover: { bg: "bg.subtle" },
    _disabled: { color: "text.muted", cursor: "default" },
  },
  variants: {
    tone: {
      neutral: { borderColor: "border.default" },
      error: { borderColor: "error.default" },
    },
  },
});
