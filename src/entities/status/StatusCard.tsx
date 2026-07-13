import Globe from "lucide-solid/icons/globe";
import House from "lucide-solid/icons/house";
import Lock from "lucide-solid/icons/lock";
import LockOpen from "lucide-solid/icons/lock-open";
import Mail from "lucide-solid/icons/mail";
import Repeat2 from "lucide-solid/icons/repeat-2";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";
import { EmojiText } from "./EmojiText";
import { StatusContent } from "./StatusContent";
import { relativeTime } from "./time";

export type Status = components["schemas"]["Status"];
type Account = Status["account"];
type VisibilityScope = components["schemas"]["VisibilityScope"];

const displayName = (account: Account): string =>
  account?.display_name || account?.acct || "?";

// Total over the closed VisibilityScope union; icons inherit the muted
// header color via currentColor.
const VISIBILITY_ICONS: Record<VisibilityScope, typeof Globe> = {
  public: Globe,
  unlisted: LockOpen,
  local: House,
  private: Lock,
  direct: Mail,
};

export const StatusCard = (props: { status: Status }) => {
  // A boost (reblog) flattens into one card: the wrapper contributes only
  // the boost line, every other zone reads the boosted status (wireframe
  // decision — a nested inner card breaks the timeline's vertical rhythm).
  const subject = () => props.status.reblog ?? props.status;
  // "_" is Akkoma's placeholder for replies whose parent is unfetched (PLAN
  // pitfalls) — it still marks the status as a reply.
  const replyTo = () =>
    subject().in_reply_to_id != null
      ? (subject().pleroma?.in_reply_to_account_acct ?? null)
      : null;

  return (
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
      <Show when={props.status.reblog}>
        <div
          class={css({
            fontSize: "xs",
            color: "text.muted",
            display: "flex",
            gap: "1",
            alignItems: "center",
            minWidth: 0,
          })}
        >
          <Repeat2 size={14} aria-hidden="true" />
          <span
            class={css({
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            boosted by{" "}
            <EmojiText
              text={displayName(props.status.account)}
              emojis={props.status.account?.emojis ?? []}
            />
          </span>
        </div>
      </Show>
      <header
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          minWidth: 0,
        })}
      >
        <Show
          when={subject().account?.avatar}
          fallback={
            <div
              class={css({
                width: "10",
                height: "10",
                borderRadius: "full",
                bg: "bg.subtle",
                flexShrink: 0,
              })}
            />
          }
        >
          {(avatar) => (
            <img
              src={avatar()}
              alt=""
              loading="lazy"
              class={css({
                width: "10",
                height: "10",
                borderRadius: "full",
                objectFit: "cover",
                flexShrink: 0,
              })}
            />
          )}
        </Show>
        <div class={css({ flex: 1, minWidth: 0 })}>
          <div
            class={css({
              fontWeight: "semibold",
              fontSize: "sm",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            <EmojiText
              text={displayName(subject().account)}
              emojis={subject().account?.emojis ?? []}
            />
          </div>
          <div
            class={css({
              color: "text.muted",
              fontSize: "xs",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            @{subject().account?.acct}
          </div>
        </div>
        <div
          class={css({
            color: "text.muted",
            fontSize: "xs",
            whiteSpace: "nowrap",
            flexShrink: 0,
            display: "flex",
            gap: "1.5",
            alignItems: "center",
          })}
        >
          <time datetime={subject().created_at} title={subject().created_at}>
            {relativeTime(subject().created_at ?? "", new Date())}
          </time>
          <Show when={subject().visibility}>
            {(visibility) => (
              <span
                role="img"
                title={visibility()}
                aria-label={visibility()}
                class={css({ display: "inline-flex", alignItems: "center" })}
              >
                <Dynamic
                  component={VISIBILITY_ICONS[visibility()]}
                  size={14}
                  aria-hidden="true"
                />
              </span>
            )}
          </Show>
        </div>
      </header>
      <Show when={subject().in_reply_to_id != null}>
        <div class={css({ fontSize: "xs", color: "text.muted" })}>
          <span aria-hidden="true">↰</span> replying to{" "}
          {replyTo() !== null ? `@${replyTo()}` : "a post"}
        </div>
      </Show>
      <StatusContent
        content={subject().content ?? ""}
        emojis={subject().emojis ?? []}
        mentions={subject().mentions ?? []}
        // Becomes `quote != null` when the quote mini-card lands (ADR-0007).
        hasQuoteCard={false}
      />
    </article>
  );
};
