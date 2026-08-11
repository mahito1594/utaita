import { useLocation, useNavigate } from "@solidjs/router";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Globe from "lucide-solid/icons/globe";
import House from "lucide-solid/icons/house";
import Lock from "lucide-solid/icons/lock";
import LockOpen from "lucide-solid/icons/lock-open";
import Mail from "lucide-solid/icons/mail";
import Repeat2 from "lucide-solid/icons/repeat-2";
import Reply from "lucide-solid/icons/reply";
import { createSignal, createUniqueId, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { css, cx } from "../../../styled-system/css";
import type { components } from "../../api/schema";
import { ActionBar } from "./ActionBar";
import { EmojiText } from "./EmojiText";
import { LinkPreview } from "./LinkPreview";
import { MediaGrid } from "./MediaGrid";
import { opensThread, requestThread } from "./open-thread";
import { PollView } from "./PollView";
import { parseEmojiReactions } from "./parse";
import { QuoteCard } from "./QuoteCard";
import { ReactionChips } from "./ReactionChips";
import { StatusContent } from "./StatusContent";
import { preciseTime, relativeTime } from "./time";
import type { Status } from "./types";
import { statusPath } from "./url";

export type { Status } from "./types";

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

// The permalink carries the timestamp and nothing else, so it borrows the
// header's muted colour instead of announcing itself as a link in every card.
const permalinkStyle = css({
  color: "inherit",
  textDecoration: "none",
  _hover: { textDecoration: "underline" },
});

export const StatusCard = (props: {
  status: Status;
  class?: string;
  /** How the header renders the post's age; "relative" unless asked. */
  timeStyle?: "relative" | "precise";
}) => {
  // A boost (reblog) flattens into one card: the wrapper contributes only
  // the boost line, every other zone reads the boosted status (wireframe
  // decision — a nested inner card breaks the timeline's vertical rhythm).
  const subject = () => props.status.reblog ?? props.status;
  const spoiler = () => subject().spoiler_text ?? "";
  const [cwExpanded, setCwExpanded] = createSignal(false);
  const bodyId = createUniqueId();
  // "_" is Akkoma's placeholder for replies whose parent is unfetched (PLAN
  // pitfalls) — it still marks the status as a reply.
  const replyTo = () =>
    subject().in_reply_to_id != null
      ? (subject().pleroma?.in_reply_to_account_acct ?? null)
      : null;

  const navigate = useNavigate();
  const location = useLocation();
  // Where this card leads, or null when it leads nowhere: a card of the post
  // that is already being read is not a way to reach it, and the thread view
  // draws its subject with this very component.
  const subjectId = () => subject().id ?? "";
  const threadPath = (): string | null => {
    if (subjectId() === "") return null;
    const path = statusPath(subjectId());
    return path === location.pathname ? null : path;
  };

  let permalink: HTMLAnchorElement | undefined;
  // One navigation for both affordances: the permalink is a real anchor, so a
  // keyboard reaches the conversation and a modified click still opens a tab,
  // while a tap anywhere on the card is routed through the same handler.
  const openThread = (event: MouseEvent) => {
    const path = threadPath();
    if (path === null || !opensThread(event, permalink)) return;
    event.preventDefault();
    requestThread(subjectId());
    navigate(path);
  };

  // Only the rendering changes with `timeStyle`: the machine-readable instant
  // and the hover text stay the raw timestamp in either mode.
  const Timestamp = () => (
    <time datetime={subject().created_at} title={subject().created_at}>
      {props.timeStyle === "precise"
        ? preciseTime(subject().created_at ?? "", new Date())
        : relativeTime(subject().created_at ?? "", new Date())}
    </time>
  );

  return (
    // Chrome-free by design (docs/design/timeline-density.md): a status is a
    // full-bleed row on a plane, so the separating rule and the background
    // belong to whatever frames it — the timeline's row wrapper and the
    // thread's list item need different ones, which is why this is not a
    // variant prop here.
    //
    // The row's inset comes in through `class` instead, because a tap anywhere
    // on the row opens the conversation: padding sitting on the frame would
    // turn the 12px around every post into dead space under the thumb.
    //
    // biome-ignore lint/a11y/useKeyWithClickEvents: a focusable row would nest interactive elements — keyboard activation stays on the permalink, which fires click natively on Enter
    <article
      onClick={openThread}
      class={cx(
        css({
          display: "flex",
          flexDirection: "column",
          gap: "2",
        }),
        props.class,
      )}
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
          <Show when={threadPath()} fallback={<Timestamp />}>
            {(path) => (
              <a ref={permalink} href={path()} class={permalinkStyle}>
                {/* Keeps the visible text inside the accessible name (WCAG
                    2.5.3) while saying what the link is for: on its own, a
                    relative time names no destination. */}
                <span class={css({ srOnly: true })}>Conversation</span>
                <Timestamp />
              </a>
            )}
          </Show>
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
        <div
          class={css({
            fontSize: "xs",
            color: "text.muted",
            display: "flex",
            gap: "1",
            alignItems: "center",
          })}
        >
          <Reply size={14} aria-hidden="true" />
          <span>
            replying to {replyTo() !== null ? `@${replyTo()}` : "a post"}
          </span>
        </div>
      </Show>
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
            px: "2.5",
            py: "1.5",
            fontSize: "sm",
            bg: "bg.subtle",
            borderWidth: "1px",
            borderColor: "border.default",
            borderRadius: "md",
            cursor: "pointer",
          })}
        >
          <span class={css({ minWidth: 0, wordBreak: "break-word" })}>
            <EmojiText text={spoiler()} emojis={subject().emojis ?? []} />
          </span>
          <span
            aria-hidden="true"
            class={css({
              display: "inline-flex",
              flexShrink: 0,
              color: "text.muted",
              transitionProperty: "transform",
              transitionDuration: "fast",
            })}
            style={{ transform: cwExpanded() ? "rotate(180deg)" : undefined }}
          >
            <ChevronDown size={16} />
          </span>
        </button>
      </Show>
      {/* hidden (not unmounted) while collapsed: reopening must not re-run
          the pipeline or lose revealed-media state, and the toggle button
          itself never moves, so scroll position stays put. */}
      <div
        id={bodyId}
        hidden={spoiler() !== "" && !cwExpanded()}
        class={css({
          display: "flex",
          flexDirection: "column",
          gap: "2",
          // The author display would otherwise beat the UA [hidden] rule.
          "&[hidden]": { display: "none" },
        })}
      >
        <StatusContent
          content={subject().content ?? ""}
          emojis={subject().emojis ?? []}
          mentions={subject().mentions ?? []}
          // With a quote card below, the server's "RE:" link would duplicate
          // the quoted URL (ADR-0007); without one it stays as the fallback.
          hasQuoteCard={subject().quote != null}
        />
        <Show when={subject().poll}>
          {(poll) => <PollView poll={poll()} />}
        </Show>
        <Show when={(subject().media_attachments ?? []).length > 0}>
          <MediaGrid
            attachments={subject().media_attachments ?? []}
            sensitive={subject().sensitive ?? false}
            statusId={subject().id ?? ""}
          />
        </Show>
        <Show when={subject().card}>
          {(card) => <LinkPreview card={card()} />}
        </Show>
        <Show when={subject().quote}>
          {(quote) => <QuoteCard status={quote()} />}
        </Show>
      </div>
      {/* Reactions are reader metadata, not spoilable content — they stay
          visible while the CW is collapsed (wireframe zone order). */}
      <ReactionChips reactions={parseEmojiReactions(subject())} />
      <ActionBar status={subject()} />
    </article>
  );
};
