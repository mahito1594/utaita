import { useLocation, useNavigate } from "@solidjs/router";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { css } from "../../../styled-system/css";
import type { components } from "../../api/schema";
import { BlurhashImage } from "./BlurhashImage";
import { MediaOverlay } from "./MediaOverlay";
import { overlayStateFor, parseOverlayState } from "./overlay";
import { parseAttachmentExtras } from "./parse";

type Attachment = components["schemas"]["Attachment"];

const clampRatio = (ratio: number | null): string =>
  // Keep a lone attachment from towering over the timeline; multi-cell
  // ratios are fixed by the grid instead.
  ratio === null ? "4 / 3" : `${Math.min(Math.max(ratio, 0.5), 2)}`;

/**
 * Attachment block of the card body: two columns (full width when single),
 * native video/audio, sensitive media hidden behind a blurhash (or plain)
 * cover until revealed. Tap-to-overlay arrives with MediaOverlay.
 */
export const MediaGrid = (props: {
  attachments: readonly Attachment[];
  sensitive: boolean;
  statusId: string;
}) => {
  const [revealed, setRevealed] = createSignal(false);
  const hidden = () => props.sensitive && !revealed();
  const single = () => props.attachments.length === 1;

  const location = useLocation();
  const navigate = useNavigate();
  // Opening pushes a history entry on the current path (same-path navigation
  // still pushes when the state differs — solid-router navigateFromRoute),
  // so back closes; closing is always navigate(-1).
  const openOverlay = (index: number) =>
    navigate(`${location.pathname}${location.search}`, {
      state: overlayStateFor(props.statusId, index),
      scroll: false,
    });
  const overlayAttachment = () => {
    const parsed = parseOverlayState(location.state);
    if (parsed === null || parsed.overlayStatusId !== props.statusId) {
      return null;
    }
    return props.attachments[parsed.overlayIndex] ?? null;
  };

  return (
    <div class={css({ position: "relative" })}>
      <div
        class={css({
          display: "grid",
          gap: "1",
          borderRadius: "md",
          overflow: "hidden",
        })}
        style={{
          "grid-template-columns": single() ? "1fr" : "1fr 1fr",
        }}
      >
        <For each={props.attachments}>
          {(attachment, index) => {
            const extras = parseAttachmentExtras(attachment);
            return (
              <div
                class={css({ minWidth: 0, overflow: "hidden" })}
                style={{
                  "aspect-ratio": single()
                    ? clampRatio(extras.aspectRatio)
                    : "1",
                }}
              >
                <Show
                  when={!hidden()}
                  fallback={<BlurhashImage blurhash={extras.blurhash} />}
                >
                  <Switch
                    fallback={
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class={css({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          bg: "bg.subtle",
                          color: "accent.default",
                          fontSize: "sm",
                          textDecoration: "underline",
                        })}
                      >
                        {attachment.description || "attachment"}
                      </a>
                    }
                  >
                    <Match when={attachment.type === "image"}>
                      <button
                        type="button"
                        onClick={() => openOverlay(index())}
                        aria-label={attachment.description || "view media"}
                        class={css({
                          display: "block",
                          width: "100%",
                          height: "100%",
                          p: 0,
                          border: "none",
                          bg: "transparent",
                          cursor: "zoom-in",
                        })}
                      >
                        <img
                          src={attachment.preview_url ?? attachment.url}
                          alt={attachment.description ?? ""}
                          loading="lazy"
                          class={css({
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            bg: "bg.subtle",
                          })}
                        />
                      </button>
                    </Match>
                    <Match when={attachment.type === "video"}>
                      {/* biome-ignore lint/a11y/useMediaCaption: fediverse attachments carry no caption tracks; description covers a11y */}
                      <video
                        src={attachment.url}
                        poster={attachment.preview_url}
                        controls
                        preload="metadata"
                        aria-label={attachment.description ?? undefined}
                        class={css({
                          display: "block",
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          bg: "bg.subtle",
                        })}
                      />
                    </Match>
                    <Match when={attachment.type === "audio"}>
                      <div
                        class={css({
                          display: "flex",
                          alignItems: "center",
                          height: "100%",
                          bg: "bg.subtle",
                          px: "2",
                        })}
                      >
                        {/* biome-ignore lint/a11y/useMediaCaption: fediverse attachments carry no caption tracks; description covers a11y */}
                        <audio
                          src={attachment.url}
                          controls
                          preload="metadata"
                          aria-label={attachment.description ?? undefined}
                          class={css({ width: "100%" })}
                        />
                      </div>
                    </Match>
                  </Switch>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <Show when={hidden()}>
        <div
          class={css({
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <button
            type="button"
            onClick={() => setRevealed(true)}
            class={css({
              px: "3",
              py: "1.5",
              fontSize: "sm",
              bg: "bg.surface",
              borderWidth: "1px",
              borderColor: "border.default",
              borderRadius: "md",
              cursor: "pointer",
            })}
          >
            Show media
          </button>
        </div>
      </Show>
      <Show when={overlayAttachment()}>
        {(attachment) => (
          <MediaOverlay
            attachment={attachment()}
            onClose={() => navigate(-1)}
          />
        )}
      </Show>
    </div>
  );
};
