import type { components } from "../../api/schema";

export type Status = components["schemas"]["Status"];

// `content` is HTML rendered and sanitized by the instance; we trust it as-is.
// Custom emoji, media attachments, CW/sensitive handling all arrive in
// Phase 1 — this card is deliberately the roughest thing that can be read.
export const StatusCard = (props: { status: Status }) => (
  <article>
    <header>
      <strong>{props.status.account?.display_name}</strong>{" "}
      <span>@{props.status.account?.acct}</span>{" "}
      <time datetime={props.status.created_at}>{props.status.created_at}</time>
    </header>
    <div innerHTML={props.status.content} />
  </article>
);
