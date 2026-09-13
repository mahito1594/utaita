import { A } from "@solidjs/router";
import Bookmark from "lucide-solid/icons/bookmark";
import Repeat2 from "lucide-solid/icons/repeat-2";
import Reply from "lucide-solid/icons/reply";
import SmilePlus from "lucide-solid/icons/smile-plus";
import Star from "lucide-solid/icons/star";
import { For, Show } from "solid-js";
import { css, cx } from "../../../styled-system/css";
import type { Status } from "./types";

const item = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
});

// Second occurrence of this rule after StatusCard.tsx's header links, and for
// the same reason: a count that leads somewhere is still a count, so it keeps
// the row's muted colour instead of announcing itself as a link.
const itemLink = css({
  color: "inherit",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
});

/**
 * Action row (wireframe bottom zone). Present from Phase 1 because card
 * height and spacing feed the design, but read-only until Phase 2 — plain
 * spans, deliberately not buttons, to avoid fake affordances.
 */
export const ActionBar = (props: {
  status: Status;
  /**
   * Where the boost and favourite counts lead, when the card is one from
   * which who did it can be read (src/pages/thread/WhoListsPage.tsx). Absent
   * on a card that only reports the numbers.
   */
  listsAt?: { favourites: string; boosts: string };
}) => {
  const items = () => [
    {
      icon: Reply,
      label: "replies",
      count: props.status.replies_count,
      href: undefined,
    },
    {
      icon: Repeat2,
      label: "boosts",
      count: props.status.reblogs_count,
      href: props.listsAt?.boosts,
    },
    {
      icon: Star,
      label: "favourites",
      count: props.status.favourites_count,
      href: props.listsAt?.favourites,
    },
    { icon: Bookmark, label: "bookmark", count: undefined, href: undefined },
    { icon: SmilePlus, label: "react", count: undefined, href: undefined },
  ];
  return (
    <div
      class={css({
        display: "flex",
        justifyContent: "space-between",
        color: "text.muted",
        fontSize: "xs",
        pt: "2",
        px: "1",
        borderTopWidth: "1px",
        borderColor: "border.default",
      })}
    >
      <For each={items()}>
        {(entry) => {
          const Body = () => (
            <>
              <entry.icon size={15} aria-hidden="true" />
              <span class={css({ srOnly: true })}>{entry.label}</span>
              <Show when={entry.count !== undefined}>{entry.count}</Show>
            </>
          );
          return (
            <Show
              when={entry.href}
              fallback={
                <span title={entry.label} class={item}>
                  <Body />
                </span>
              }
            >
              {(href) => (
                <A href={href()} title={entry.label} class={cx(item, itemLink)}>
                  <Body />
                </A>
              )}
            </Show>
          );
        }}
      </For>
    </div>
  );
};
