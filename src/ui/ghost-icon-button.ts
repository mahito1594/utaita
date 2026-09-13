import { css } from "../../styled-system/css";

// The app-wide 40px icon-only button: borderless and transparent until
// hovered, so it reads as part of the bar it sits in rather than a separate
// control (docs/design/timeline-refresh-20260719.html). The icon is the whole
// label, so call sites carry the accessible name on `aria-label`. `_disabled`
// is in the base — it also matches `[aria-disabled=true]` in this project's
// Panda preset — and is inert where nothing ever disables the control.
export const ghostIconButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "10",
  height: "10",
  borderRadius: "md",
  bg: "transparent",
  color: "accent.default",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { color: "text.muted", cursor: "default" },
});
