import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { EmojiReaction } from "./parse";

// A reaction is the same emoji the body draws, so it is drawn at the same size
// (StatusContent.tsx: 2em ≈ 32px). Sized off the root rather than the chip's
// `xs`, which belongs to the count beside it — akkoma-fe likewise runs its
// reaction emoji at body size (emoji_reactions.vue).
const customReaction = css({ height: "8", width: "auto" });

// The unicode counterpart, where the glyph is text: its box has to be set
// against the image's height, and a glyph draws taller than the em it is
// asked for (akkoma-fe holds the same ratio, 2.125em of text to 2.55em of
// image). `lineHeight` 1 keeps the chip from growing a leading of its own.
const unicodeReaction = css({ fontSize: "2xl", lineHeight: "1" });

// The chip carries its own text size rather than inheriting one, so it looks
// the same wherever it is placed — on a card and as the heading of a list of
// who reacted (src/pages/thread/WhoListsPage.tsx).
const chip = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  px: "2",
  py: "0.5",
  fontSize: "xs",
  borderWidth: "1px",
  borderRadius: "full",
  borderColor: "border.default",
  color: "text.muted",
  "&[data-me]": {
    borderColor: "accent.default",
    color: "accent.default",
  },
});

const ChipBody = (props: { reaction: EmojiReaction }) => (
  <>
    <Show
      when={props.reaction.url}
      fallback={<span class={unicodeReaction}>{props.reaction.name}</span>}
    >
      {(url) => (
        <img
          src={url()}
          alt={props.reaction.name}
          loading="lazy"
          class={customReaction}
        />
      )}
    </Show>
    {props.reaction.count}
  </>
);

/**
 * One reaction: the emoji and how many accounts used it. Unicode reactions
 * have url: null and render as text; custom emoji render their image; `me`
 * gets the accent outline. Display-only: who reacted is read from the stats
 * row under the thread's subject (StatusCard.tsx), not from the chip.
 */
export const ReactionChip = (props: { reaction: EmojiReaction }) => (
  <span
    title={props.reaction.name}
    class={chip}
    {...(props.reaction.me ? { "data-me": "" } : {})}
  >
    <ChipBody reaction={props.reaction} />
  </span>
);

/**
 * Display-only reaction chips (reacting is Phase 2; who reacted is a list
 * under the thread, src/pages/thread/WhoListsPage.tsx).
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
      })}
    >
      <For each={props.reactions}>
        {(reaction) => <ReactionChip reaction={reaction} />}
      </For>
    </div>
  </Show>
);
