import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { css } from "../../../styled-system/css";
import { EmojiText } from "../../entities/status/EmojiText";
import { profilePath } from "../../entities/status/mention";
import type { Account } from "./profile-api";

// The inset the row carries so a tap anywhere on it opens the profile, at the
// post rows' rhythm (docs/design/timeline-density.md). The rule underneath is
// the enclosing row's, as it is for the post list (ProfilePage.tsx).
const rowBody = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  px: "3",
  py: "3",
  minWidth: 0,
  color: "inherit",
  textDecoration: "none",
});

// Same size as the avatar on a post card (StatusCard.tsx); duplicated rather
// than shared, this being the second place that draws one (CLAUDE.md, rule of
// three).
const avatarShape = {
  width: "10",
  height: "10",
  borderRadius: "full",
  flexShrink: 0,
} as const;

const avatarFallback = css({ ...avatarShape, bg: "bg.subtle" });
const avatarImage = css({ ...avatarShape, objectFit: "cover" });

const truncated = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const nameColumn = css({ flex: 1, minWidth: 0 });
const displayLine = css({
  ...truncated,
  fontWeight: "semibold",
  fontSize: "sm",
});
const acctLine = css({ ...truncated, color: "text.muted", fontSize: "xs" });

/**
 * One account in a follow list: avatar, display name and acct, the whole row a
 * single anchor to that profile. Unlike a post card there is no second tap
 * target to compete with it, so nothing here has to be hidden from the tab
 * order.
 *
 * Bios, relationship badges and a follow button are not part of it; following
 * from a list is Phase 2 work (docs/PLAN.ja.md).
 */
export const AccountRow = (props: { account: Account }) => {
  const acct = () => props.account.acct ?? "";
  // An account whose display name is blank is named by its acct, as it is on a
  // post card (StatusCard.tsx).
  const name = () => props.account.display_name || acct();

  const Body = () => (
    <>
      <Show
        when={props.account.avatar}
        fallback={<div class={avatarFallback} />}
      >
        {(avatar) => (
          <img src={avatar()} alt="" loading="lazy" class={avatarImage} />
        )}
      </Show>
      <div class={nameColumn}>
        <div class={displayLine}>
          <EmojiText text={name()} emojis={props.account.emojis ?? []} />
        </div>
        <Show when={acct() !== ""}>
          <div class={acctLine}>@{acct()}</div>
        </Show>
      </div>
    </>
  );

  return (
    <li
      class={css({ borderBottomWidth: "1px", borderColor: "border.default" })}
    >
      {/* Without an acct there is no profile URL to point at, so the row
          renders as plain content rather than as a link leading nowhere. */}
      <Show
        when={acct() !== ""}
        fallback={
          <div class={rowBody}>
            <Body />
          </div>
        }
      >
        <A href={profilePath(acct())} class={rowBody}>
          <Body />
        </A>
      </Show>
    </li>
  );
};
