import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";

export type Status = components["schemas"]["Status"];

// `content` is HTML rendered and sanitized by the instance; we trust it as-is.
// Custom emoji, media attachments, CW/sensitive handling all arrive in
// Phase 1 — this card is deliberately the roughest thing that can be read.
export const StatusCard = (props: { status: Status }) => (
  <article
    class={css({
      bg: "bg.surface",
      borderWidth: "1px",
      borderColor: "border.default",
      borderRadius: "xl",
      p: "3",
      display: "flex",
      flexDirection: "column",
      gap: "2",
    })}
  >
    <header
      class={css({
        display: "flex",
        alignItems: "baseline",
        gap: "1.5",
        fontSize: "sm",
        minWidth: 0,
      })}
    >
      <strong class={css({ fontWeight: "semibold", flexShrink: 0 })}>
        {props.status.account?.display_name}
      </strong>
      <span
        class={css({
          color: "text.muted",
          fontSize: "xs",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        })}
      >
        @{props.status.account?.acct}
      </span>
      <time
        datetime={props.status.created_at}
        class={css({
          color: "text.muted",
          fontSize: "xs",
          whiteSpace: "nowrap",
          ml: "auto",
        })}
      >
        {props.status.created_at}
      </time>
    </header>
    <div
      class={css({
        lineHeight: "relaxed",
        wordBreak: "break-word",
        // Instance HTML arrives with its own paragraphs/links; preflight
        // stripped their styles, so restore the minimum here.
        "& :where(p + p)": { mt: "2" },
        "& :where(a)": {
          color: "accent.default",
          textDecoration: "underline",
        },
      })}
      innerHTML={props.status.content}
    />
  </article>
);
