import { useNavigate } from "@solidjs/router";
import { createEffect } from "solid-js";
import { css } from "../../../styled-system/css";
import { renderContent } from "./content";
import type { Emoji } from "./emoji";
import type { Mention } from "./mention";
import { mentionPath } from "./mention";

type StatusContentProps = {
  content: string;
  emojis: readonly Emoji[];
  mentions: readonly Mention[];
  hasQuoteCard: boolean;
};

/**
 * Imperative shell around the content pipeline (ADR-0013): the sanitized,
 * transformed fragment is inserted through a ref — content is static per
 * status, so nothing reactive is lost — and mention navigation is one
 * delegated click listener instead of per-anchor handlers.
 */
export const StatusContent = (props: StatusContentProps) => {
  const navigate = useNavigate();

  const handleClick = (event: MouseEvent) => {
    // Same bail-out as solid-router's own anchor handler: modifier clicks
    // ("open in new tab") and non-primary buttons keep their native behavior.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a");
    if (anchor === null || !anchor.classList.contains("mention")) return;
    event.preventDefault();
    const href = anchor.getAttribute("href") ?? "";
    const path = mentionPath(href, props.mentions);
    if (path !== null) {
      navigate(path);
    } else if (href !== "") {
      // A mention this status doesn't know (e.g. inherited markup quirk):
      // fall back to the remote profile, external and explicit (ADR-0011).
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  let container: HTMLDivElement | undefined;
  createEffect(() => {
    const fragment = renderContent(props.content, {
      emojis: props.emojis,
      hasQuoteCard: props.hasQuoteCard,
    });
    container?.replaceChildren(fragment);
  });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegated listener refining anchor clicks; the div itself is not interactive
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation stays on the anchors, which fire click natively on Enter
    <div
      ref={container}
      onClick={handleClick}
      class={css({
        lineHeight: "relaxed",
        wordBreak: "break-word",
        // Instance HTML arrives with its own paragraphs/links; preflight
        // stripped their styles, so restore the minimum here.
        "& :where(p + p)": { mt: "2" },
        "& :where(a)": {
          color: "accent.default",
          textDecoration: "underline",
        },
        "& :where(img.custom-emoji)": {
          display: "inline-block",
          height: "1.25em",
          width: "auto",
          verticalAlign: "text-bottom",
        },
        "& :where(pre)": { overflowX: "auto" },
        "& :where(blockquote)": {
          borderLeftWidth: "2px",
          borderColor: "border.default",
          pl: "3",
          color: "text.muted",
        },
      })}
    />
  );
};
