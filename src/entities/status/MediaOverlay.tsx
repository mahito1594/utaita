import X from "lucide-solid/icons/x";
import { onMount, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";

type Attachment = components["schemas"]["Attachment"];

/**
 * Full-size image view. It owns no open/close state: MediaGrid renders it
 * while location.state matches (overlay.ts), and every close affordance —
 * button, backdrop, Escape, and the platform back gesture — funnels through
 * onClose = navigate(-1), so history stays consistent. `<dialog>` +
 * showModal() gives initial focus, the focus trap, and Escape (as a
 * cancelable `cancel` event) for free; we only redirect where each of those
 * leads. showModal() also promotes the element to the top layer, so no
 * Portal is needed to escape ancestor stacking contexts.
 */
export const MediaOverlay = (props: {
  attachment: Attachment;
  onClose: () => void;
}) => {
  let dialogRef: HTMLDialogElement | undefined;
  onMount(() => dialogRef?.showModal());

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: click-to-close on the backdrop; Escape is already handled natively via the cancel event above, and the close button is the accessible affordance
    <dialog
      ref={dialogRef}
      aria-label={props.attachment.description || "media"}
      onCancel={(event) => {
        // Let onClose (navigate(-1)) drive the actual close, so history
        // stays consistent; the dialog itself unmounts once location.state
        // stops matching.
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
      class={css({
        position: "fixed",
        inset: 0,
        m: 0,
        border: "none",
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
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
    </dialog>
  );
};
