import Bookmark from "lucide-solid/icons/bookmark";
import Repeat2 from "lucide-solid/icons/repeat-2";
import Reply from "lucide-solid/icons/reply";
import SmilePlus from "lucide-solid/icons/smile-plus";
import Star from "lucide-solid/icons/star";
import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { Status } from "./types";

/**
 * Action row (wireframe bottom zone). Present from Phase 1 because card
 * height and spacing feed the design, but read-only until Phase 2 — plain
 * spans, deliberately not buttons, to avoid fake affordances.
 */
export const ActionBar = (props: { status: Status }) => {
  const items = () => [
    { icon: Reply, label: "replies", count: props.status.replies_count },
    { icon: Repeat2, label: "boosts", count: props.status.reblogs_count },
    { icon: Star, label: "favourites", count: props.status.favourites_count },
    { icon: Bookmark, label: "bookmark", count: undefined },
    { icon: SmilePlus, label: "react", count: undefined },
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
        {(item) => (
          <span
            title={item.label}
            class={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "1",
            })}
          >
            <item.icon size={15} aria-hidden="true" />
            <span class={css({ srOnly: true })}>{item.label}</span>
            <Show when={item.count !== undefined}>{item.count}</Show>
          </span>
        )}
      </For>
    </div>
  );
};
