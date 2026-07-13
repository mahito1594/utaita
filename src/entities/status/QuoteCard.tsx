import ChevronDown from "lucide-solid/icons/chevron-down";
import { createSignal, createUniqueId, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import { EmojiText } from "./EmojiText";
import { MediaGrid } from "./MediaGrid";
import type { Status } from "./StatusCard";
import { StatusContent } from "./StatusContent";

/**
 * Quote mini-card (ADR-0007), depth 1 by design: it renders no quote card of
 * its own and keeps the server's "RE:" quote-inline link, so deeper chains
 * degrade to links. A separate component rather than a StatusCard variant —
 * no action bar, no reactions, no boost line; sharing happens through the
 * leaves (StatusContent, EmojiText, MediaGrid). Tapping through to the
 * thread arrives with the thread session.
 */
export const QuoteCard = (props: { status: Status }) => {
  const spoiler = () => props.status.spoiler_text ?? "";
  const [cwExpanded, setCwExpanded] = createSignal(false);
  const bodyId = createUniqueId();

  return (
    <div
      class={css({
        borderWidth: "1px",
        borderColor: "border.default",
        borderRadius: "md",
        p: "2",
        display: "flex",
        flexDirection: "column",
        gap: "1.5",
        fontSize: "sm",
      })}
    >
      <header
        class={css({
          display: "flex",
          alignItems: "center",
          gap: "1.5",
          minWidth: 0,
          fontSize: "xs",
        })}
      >
        <Show when={props.status.account?.avatar}>
          {(avatar) => (
            <img
              src={avatar()}
              alt=""
              loading="lazy"
              class={css({
                width: "5",
                height: "5",
                borderRadius: "full",
                objectFit: "cover",
                flexShrink: 0,
              })}
            />
          )}
        </Show>
        <span
          class={css({
            fontWeight: "semibold",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          <EmojiText
            text={
              props.status.account?.display_name ||
              props.status.account?.acct ||
              "?"
            }
            emojis={props.status.account?.emojis ?? []}
          />
        </span>
        <span
          class={css({
            color: "text.muted",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          @{props.status.account?.acct}
        </span>
      </header>
      <Show when={spoiler() !== ""}>
        <button
          type="button"
          aria-expanded={cwExpanded()}
          aria-controls={bodyId}
          onClick={() => setCwExpanded((expanded) => !expanded)}
          class={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "2",
            width: "100%",
            textAlign: "left",
            px: "2",
            py: "1",
            fontSize: "xs",
            bg: "bg.subtle",
            borderWidth: "1px",
            borderColor: "border.default",
            borderRadius: "sm",
            cursor: "pointer",
          })}
        >
          <span class={css({ minWidth: 0, wordBreak: "break-word" })}>
            <EmojiText text={spoiler()} emojis={props.status.emojis ?? []} />
          </span>
          <span
            aria-hidden="true"
            class={css({
              display: "inline-flex",
              flexShrink: 0,
              color: "text.muted",
            })}
            style={{ transform: cwExpanded() ? "rotate(180deg)" : undefined }}
          >
            <ChevronDown size={14} />
          </span>
        </button>
      </Show>
      <div
        id={bodyId}
        hidden={spoiler() !== "" && !cwExpanded()}
        class={css({
          display: "flex",
          flexDirection: "column",
          gap: "1.5",
          "&[hidden]": { display: "none" },
        })}
      >
        <StatusContent
          content={props.status.content ?? ""}
          emojis={props.status.emojis ?? []}
          mentions={props.status.mentions ?? []}
          // Depth cut: nested quotes stay as the server's RE: link.
          hasQuoteCard={false}
        />
        <Show when={(props.status.media_attachments ?? []).length > 0}>
          <MediaGrid
            attachments={props.status.media_attachments ?? []}
            sensitive={props.status.sensitive ?? false}
            statusId={props.status.id ?? ""}
          />
        </Show>
      </div>
    </div>
  );
};
