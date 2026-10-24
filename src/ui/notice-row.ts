import { css } from "../../styled-system/css";

// Whichever of the loading/empty states shows stands alone on its plane, so it
// takes the row inset without the rule.
export const noticeRow = css({
  px: "3",
  py: "3",
  color: "text.muted",
});
