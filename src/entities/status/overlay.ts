// The media overlay is location.state-driven (plan decision): opening pushes
// a history entry on the same path, so the platform back gesture closes it.
// location.state round-trips through the History API as unknown — parse it
// once here (parse-don't-validate); a mismatch or garbage simply means "no
// overlay open".

export type OverlayState = {
  overlayStatusId: string;
  overlayIndex: number;
};

export const overlayStateFor = (
  statusId: string,
  index: number,
): OverlayState => ({
  overlayStatusId: statusId,
  overlayIndex: index,
});

export const parseOverlayState = (state: unknown): OverlayState | null => {
  if (typeof state !== "object" || state === null) return null;
  if (
    !("overlayStatusId" in state) ||
    typeof state.overlayStatusId !== "string"
  ) {
    return null;
  }
  if (
    !("overlayIndex" in state) ||
    typeof state.overlayIndex !== "number" ||
    !Number.isInteger(state.overlayIndex) ||
    state.overlayIndex < 0
  ) {
    return null;
  }
  return {
    overlayStatusId: state.overlayStatusId,
    overlayIndex: state.overlayIndex,
  };
};
