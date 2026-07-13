import Check from "lucide-solid/icons/check";
import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";
import { EmojiText } from "./EmojiText";
import { parsePoll } from "./parse";

type Poll = components["schemas"]["Poll"];

const expiryFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Read-only poll block (voting is Phase 2). */
export const PollView = (props: { poll: Poll }) => {
  const poll = () => parsePoll(props.poll);
  return (
    <div class={css({ display: "flex", flexDirection: "column", gap: "1.5" })}>
      <For each={poll().options}>
        {(option, index) => (
          <div
            class={css({
              position: "relative",
              overflow: "hidden",
              borderRadius: "sm",
            })}
          >
            <div
              aria-hidden="true"
              class={css({
                position: "absolute",
                insetBlock: 0,
                left: 0,
                bg: "bg.subtle",
              })}
              style={{ width: `${Math.round(option.ratio * 100)}%` }}
            />
            <div
              class={css({
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "1.5",
                px: "2",
                py: "1",
                fontSize: "sm",
              })}
            >
              <span class={css({ minWidth: 0, wordBreak: "break-word" })}>
                <EmojiText
                  text={option.title}
                  emojis={props.poll.emojis ?? []}
                />
              </span>
              <Show when={poll().ownVotes.has(index())}>
                <span
                  role="img"
                  aria-label="your vote"
                  class={css({
                    display: "inline-flex",
                    color: "accent.default",
                    flexShrink: 0,
                  })}
                >
                  <Check size={14} />
                </span>
              </Show>
              <span
                class={css({
                  ml: "auto",
                  flexShrink: 0,
                  color: "text.muted",
                  fontSize: "xs",
                })}
              >
                {Math.round(option.ratio * 100)}% ({option.votesCount})
              </span>
            </div>
          </div>
        )}
      </For>
      <div class={css({ fontSize: "xs", color: "text.muted" })}>
        {poll().votersCount ?? poll().votesCount}{" "}
        {poll().votersCount !== null ? "voters" : "votes"}
        {" · "}
        <Show when={!poll().expired} fallback={"closed"}>
          <Show when={poll().expiresAt} fallback={"open"}>
            {(expiresAt) => (
              <time datetime={expiresAt()} title={expiresAt()}>
                closes {expiryFormat.format(new Date(expiresAt()))}
              </time>
            )}
          </Show>
        </Show>
        <Show when={poll().anonymous === true}> · anonymous</Show>
      </div>
    </div>
  );
};
