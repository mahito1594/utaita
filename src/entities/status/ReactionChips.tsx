import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { EmojiReaction } from "./parse";

/**
 * Display-only reaction chips (reacting is Phase 2; the who-reacted list
 * belongs to the thread view). Unicode reactions have url: null and render
 * as text; custom emoji render their image; `me` gets the accent outline.
 */
export const ReactionChips = (props: {
  reactions: readonly EmojiReaction[];
}) => (
  <Show when={props.reactions.length > 0}>
    <div
      class={css({
        display: "flex",
        gap: "1.5",
        flexWrap: "wrap",
        fontSize: "xs",
      })}
    >
      <For each={props.reactions}>
        {(reaction) => (
          <span
            title={reaction.name}
            class={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "1",
              px: "2",
              py: "0.5",
              borderWidth: "1px",
              borderRadius: "full",
              borderColor: "border.default",
              color: "text.muted",
              "&[data-me]": {
                borderColor: "accent.default",
                color: "accent.default",
              },
            })}
            {...(reaction.me ? { "data-me": "" } : {})}
          >
            <Show when={reaction.url} fallback={<span>{reaction.name}</span>}>
              {(url) => (
                <img
                  src={url()}
                  alt={reaction.name}
                  loading="lazy"
                  class={css({ height: "1.25em", width: "auto" })}
                />
              )}
            </Show>
            {reaction.count}
          </span>
        )}
      </For>
    </div>
  </Show>
);
