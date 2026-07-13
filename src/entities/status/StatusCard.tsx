import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";
import { StatusContent } from "./StatusContent";

export type Status = components["schemas"]["Status"];

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
    <StatusContent
      content={props.status.content ?? ""}
      emojis={props.status.emojis ?? []}
      mentions={props.status.mentions ?? []}
      // Becomes `quote != null` when the quote mini-card lands (ADR-0007).
      hasQuoteCard={false}
    />
  </article>
);
