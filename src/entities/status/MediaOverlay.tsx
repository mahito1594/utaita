import X from "lucide-solid/icons/x";
import { onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";

type Attachment = components["schemas"]["Attachment"];

/**
 * Full-size image view. It owns no open/close state: MediaGrid renders it
 * while location.state matches (overlay.ts), and every close affordance —
 * button, backdrop, Escape, and the platform back gesture — funnels through
 * onClose = navigate(-1), so history stays consistent.
 */
export const MediaOverlay = (props: {
  attachment: Attachment;
  onClose: () => void;
}) => {
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose();
  };
  onMount(() => document.addEventListener("keydown", handleKeydown));
  onCleanup(() => document.removeEventListener("keydown", handleKeydown));

  return (
    <Portal>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close; the close button is the accessible affordance */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled by the document listener above */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.attachment.description || "media"}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose();
        }}
        class={css({
          position: "fixed",
          inset: 0,
          zIndex: 10,
          bg: "bg.backdrop",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: "4",
          gap: "3",
        })}
      >
        <img
          src={props.attachment.url}
          alt={props.attachment.description ?? ""}
          class={css({
            maxWidth: "100%",
            maxHeight: "85vh",
            objectFit: "contain",
            borderRadius: "sm",
          })}
        />
        <Show when={props.attachment.description}>
          {(description) => (
            <p
              class={css({
                bg: "bg.surface",
                borderRadius: "md",
                px: "3",
                py: "1",
                fontSize: "sm",
                maxWidth: "600px",
              })}
            >
              {description()}
            </p>
          )}
        </Show>
        <button
          type="button"
          aria-label="Close"
          onClick={() => props.onClose()}
          class={css({
            position: "absolute",
            top: "3",
            right: "3",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "9",
            height: "9",
            bg: "bg.surface",
            borderWidth: "1px",
            borderColor: "border.default",
            borderRadius: "full",
            cursor: "pointer",
          })}
        >
          <X size={18} />
        </button>
      </div>
    </Portal>
  );
};
