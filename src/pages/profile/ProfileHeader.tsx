import { For, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import { EmojiText } from "../../entities/status/EmojiText";
import { StatusContent } from "../../entities/status/StatusContent";
import type { Account } from "./profile-api";

// A band across the top of the plane, not a framed image: the account's own
// header when it has one, a plain field of `bg.subtle` when it doesn't (the
// instance's default header is a blank image, so there is nothing to show).
const headerBandShape = {
  height: "24",
  width: "100%",
  bg: "bg.subtle",
} as const;

const headerBand = css(headerBandShape);
const headerImage = css({ ...headerBandShape, objectFit: "cover" });

// The avatar straddles the band's bottom edge and carries a ring of the plane
// it sits on, so the circle reads as one shape over two backgrounds.
const avatarShape = {
  width: "20",
  height: "20",
  borderRadius: "full",
  bg: "bg.subtle",
  borderWidth: "3px",
  borderColor: "bg.surface",
  flexShrink: 0,
} as const;

const avatarFallback = css(avatarShape);
const avatarImage = css({ ...avatarShape, objectFit: "cover" });

const identity = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  // Same 12px inset as the post rows below, so the names and the posts share
  // one vertical line (docs/design/timeline-density.md).
  p: "3",
});

const avatarRow = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "3",
  minWidth: 0,
  // Half the avatar hangs over the band above; the row's own top padding is
  // the plane's, so only this pull is needed.
  mt: "-10",
});

// Name and handle share the ellipsis treatment of the card header
// (StatusCard.tsx): a long remote acct must not push the layout wider than
// the column.
const truncated = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const displayNameStyle = css({
  ...truncated,
  fontSize: "md",
  fontWeight: "semibold",
});

const acctStyle = css({ ...truncated, fontSize: "sm", color: "text.muted" });

// Name/value pairs in one grid rather than two columns of blocks, so every
// value starts at the same offset however long the names are.
const fieldList = css({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: "3",
  rowGap: "1",
  fontSize: "sm",
  borderWidth: "1px",
  borderColor: "border.default",
  borderRadius: "md",
  p: "2",
});

const fieldName = css({ ...truncated, color: "text.muted" });
const fieldValue = css({ minWidth: 0 });

const countsRow = css({ display: "flex", gap: "4", fontSize: "sm" });

// Display-only this session: the counts become entry points into the tab bar
// and the follow lists once those exist (docs/design/profile-page-20260830.html).
// A count that is absent — withheld by the account or simply not in the payload
// — renders nothing: a zero would be a claim the instance never made.
const Count = (props: { value: number | undefined; label: string }) => (
  <Show when={props.value !== undefined}>
    <span>
      <b>{props.value}</b>{" "}
      <span class={css({ color: "text.muted" })}>{props.label}</span>
    </span>
  </Show>
);

/**
 * The profile's identity block: header image, avatar, names, bio, fields and
 * counts, in the zone order the wireframe fixes
 * (docs/design/profile-page-20260830.html).
 *
 * Known limit: `note` and the field values are rendered with no mentions, so a
 * mention inside a bio has nothing to resolve against and falls back to
 * opening the remote profile externally (StatusContent.tsx). The account
 * endpoint carries no `Status.mentions` equivalent to resolve them with.
 */
export const ProfileHeader = (props: { account: Account }) => {
  const emojis = () => props.account.emojis ?? [];
  const displayName = () =>
    props.account.display_name || props.account.acct || "?";

  return (
    <header>
      <Show
        when={props.account.header}
        fallback={<div class={headerBand} aria-hidden="true" />}
      >
        {(header) => (
          <img
            src={header()}
            // The author's own description when they wrote one; decorative
            // otherwise — the name below carries the identity either way.
            alt={props.account.header_description ?? ""}
            class={headerImage}
          />
        )}
      </Show>

      <div class={identity}>
        <div class={avatarRow}>
          <Show
            when={props.account.avatar}
            fallback={<div class={avatarFallback} />}
          >
            {(avatar) => (
              <img
                src={avatar()}
                alt={props.account.avatar_description ?? ""}
                class={avatarImage}
              />
            )}
          </Show>
          <div class={css({ flex: 1, minWidth: 0 })}>
            <h2 class={displayNameStyle}>
              <EmojiText text={displayName()} emojis={emojis()} />
            </h2>
            {/* Always the full acct, domain included: a remote handle without
                its domain names a different account on this instance. */}
            <p class={acctStyle}>@{props.account.acct}</p>
          </div>
        </div>

        <Show when={props.account.note}>
          {(note) => (
            <StatusContent
              content={note()}
              emojis={emojis()}
              mentions={[]}
              hasQuoteCard={false}
            />
          )}
        </Show>

        <Show when={(props.account.fields ?? []).length > 0}>
          <dl class={fieldList}>
            <For each={props.account.fields}>
              {(field) => (
                <>
                  <dt class={fieldName}>
                    <EmojiText text={field.name ?? ""} emojis={emojis()} />
                  </dt>
                  {/* HTML, not text: field values are where profile links
                      live, and the instance delivers them as markup. */}
                  <dd class={fieldValue}>
                    <StatusContent
                      content={field.value ?? ""}
                      emojis={emojis()}
                      mentions={[]}
                      hasQuoteCard={false}
                    />
                  </dd>
                </>
              )}
            </For>
          </dl>
        </Show>

        {/* An account can hide its follow stats from everyone; the post count
            has no such switch. Hidden here means shown as nothing at all —
            Akkoma still sends the number. */}
        <div class={countsRow}>
          <Count value={props.account.statuses_count} label="posts" />
          <Count
            value={
              props.account.pleroma?.hide_follows_count
                ? undefined
                : props.account.following_count
            }
            label="following"
          />
          <Count
            value={
              props.account.pleroma?.hide_followers_count
                ? undefined
                : props.account.followers_count
            }
            label="followers"
          />
        </div>
      </div>
    </header>
  );
};
