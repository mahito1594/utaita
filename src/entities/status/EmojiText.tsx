import { For } from "solid-js";
import { css } from "../../../styled-system/css";
import type { Emoji } from "./emoji";
import { segmentByShortcode } from "./emoji";

/**
 * Plain text with `:shortcode:` custom emoji rendered inline — display
 * names, boost lines, poll options. Body HTML goes through StatusContent
 * instead; this is for fields the API delivers as text.
 */
export const EmojiText = (props: {
  text: string;
  emojis: readonly Emoji[];
}) => (
  <For each={segmentByShortcode(props.text, props.emojis)}>
    {(segment) =>
      segment.kind === "text" ? (
        segment.text
      ) : (
        <img
          src={segment.url}
          alt={`:${segment.shortcode}:`}
          title={`:${segment.shortcode}:`}
          loading="lazy"
          class={css({
            display: "inline-block",
            height: "1.25em",
            width: "auto",
            verticalAlign: "text-bottom",
          })}
        />
      )
    }
  </For>
);
