import { decode } from "blurhash";
import { createEffect } from "solid-js";
import { css } from "../../../styled-system/css";

// Decode at 32×32 and let CSS stretch it — blurhash output is inherently
// blurry, so a larger raster only costs CPU (Wolt's own guidance).
const RASTER = 32;

// Third-party throw at the boundary (invalid hash): undefined means "keep
// the plain placeholder" rather than propagate.
const decodePixels = (hash: string): Uint8ClampedArray | undefined => {
  try {
    return decode(hash, RASTER, RASTER);
  } catch {
    return undefined;
  }
};

/**
 * Blurred placeholder for hidden/loading media. Degrades to a plain
 * `bg.subtle` rectangle when the hash is missing (remote attachments often
 * lack it — PLAN pitfalls), the hash is invalid, or the environment has no
 * 2D canvas (happy-dom).
 */
export const BlurhashImage = (props: { blurhash: string | null }) => {
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    const hash = props.blurhash;
    if (canvas === undefined || hash === null) return;
    const pixels = decodePixels(hash);
    if (pixels === undefined) return;
    const context = canvas.getContext("2d");
    if (context === null) return;
    const imageData = context.createImageData(RASTER, RASTER);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
  });
  return (
    // aria-hidden lives on the wrapper: Biome treats <canvas> itself as
    // interactive content and rejects both aria-hidden and role there.
    <div aria-hidden="true" class={css({ width: "100%", height: "100%" })}>
      <canvas
        ref={canvas}
        width={RASTER}
        height={RASTER}
        class={css({
          display: "block",
          width: "100%",
          height: "100%",
          bg: "bg.subtle",
        })}
      />
    </div>
  );
};
