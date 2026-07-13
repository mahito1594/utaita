import { Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";

type Card = NonNullable<components["schemas"]["Status"]["card"]>;

/**
 * Lightweight link preview: fixed-ratio thumbnail + title + provider, the
 * whole card opening the link externally (an explicit link affordance,
 * consistent with ADR-0011). No embed html, no player. The card payload
 * carries no blurhash or dimensions (measured 2026-07-13), hence the fixed
 * thumbnail box.
 */
export const LinkPreview = (props: { card: Card }) => (
  <a
    href={props.card.url}
    target="_blank"
    rel="noopener noreferrer"
    class={css({
      display: "flex",
      gap: "2.5",
      alignItems: "stretch",
      borderWidth: "1px",
      borderColor: "border.default",
      borderRadius: "md",
      overflow: "hidden",
      textDecoration: "none",
      _hover: { bg: "bg.subtle" },
    })}
  >
    <Show when={props.card.image}>
      {(image) => (
        <img
          src={image()}
          alt=""
          loading="lazy"
          class={css({
            width: "24",
            flexShrink: 0,
            objectFit: "cover",
            bg: "bg.subtle",
            aspectRatio: "1",
          })}
        />
      )}
    </Show>
    <div
      class={css({
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: "0.5",
        py: "2",
        pr: "2.5",
        minWidth: 0,
        "&:first-child": { pl: "2.5" },
      })}
    >
      <span
        class={css({
          fontSize: "sm",
          fontWeight: "semibold",
          lineClamp: 2,
          overflow: "hidden",
        })}
      >
        {props.card.title}
      </span>
      <Show when={props.card.provider_name}>
        <span
          class={css({
            fontSize: "xs",
            color: "text.muted",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          })}
        >
          {props.card.provider_name}
        </span>
      </Show>
    </div>
  </a>
);
