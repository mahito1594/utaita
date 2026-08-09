// Opening a status's conversation from the card that draws it: which taps
// count as a tap on the card, and how the thread view learns that it was
// opened on purpose.

/**
 * Descendants of a card that own their own tap. Selected by element kind
 * rather than by region, so a control leaves the card's tap the moment it
 * becomes a control: the action bar and a poll are read-only renderings today
 * and are card surface like any other text, and they drop out on their own
 * once they are buttons.
 */
const INTERACTIVE = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  // Native players: the whole control strip is inside the element.
  "video",
  "audio",
  // The media overlay stays in the card's subtree while it is open.
  "dialog",
  "[role='button']",
  "[role='link']",
].join(", ");

/**
 * Whether a click that reached a status card should open that status's
 * conversation.
 *
 * `ownLink` is the card's visible permalink — the one interactive descendant a
 * card-wide tap takes over, so that the link a keyboard reaches and the card
 * surface a thumb reaches are one navigation rather than two.
 */
export const opensThread = (
  event: MouseEvent,
  ownLink: Element | undefined,
): boolean => {
  // Same bail-out as solid-router's own anchor handler: a modified or
  // non-primary click keeps its native meaning ("open in a new tab").
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  ) {
    return false;
  }
  if (!(event.target instanceof Element)) return false;
  const interactive = event.target.closest(INTERACTIVE);
  if (interactive !== null && interactive !== ownLink) return false;
  // A drag that ends on the card was a reader selecting text. The selection is
  // still standing when the click arrives, whereas an ordinary click collapsed
  // whatever was selected on mousedown.
  const selection = window.getSelection();
  return selection === null || selection.isCollapsed;
};

/**
 * The status whose conversation the app is on its way to open, if any.
 *
 * The router cannot answer "was this arrival asked for, or did the browser
 * walk back into it" for a change of `:id` alone: @solidjs/router keys a route
 * context by its route definition, so `/statuses/a` → `/statuses/b` reuses the
 * context that already exists and never re-runs the route's `preload` — the
 * one place `intent` is readable. The navigation itself is what knows, so it
 * says so here, and the thread view reads it once per arrival.
 */
let requestedId: string | undefined;

/** Records that the app is about to open `id`'s conversation deliberately. */
export const requestThread = (id: string): void => {
  requestedId = id;
};

/**
 * Answers, once, whether arriving at `id`'s conversation was such a request.
 * Every arrival consumes the record, so one that went unclaimed (a request the
 * router turned down) cannot be mistaken for a later arrival's.
 */
export const takeThreadRequest = (id: string): boolean => {
  const requested = requestedId === id;
  requestedId = undefined;
  return requested;
};
