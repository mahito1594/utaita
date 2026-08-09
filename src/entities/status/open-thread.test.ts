// @vitest-environment happy-dom
// The decision logic behind a card-wide tap, tested directly rather than only
// through the page that mounts it (ADR-0009). A DOM is here because the input
// *is* a DOM event — real elements and real dispatch, no mocks.
import { afterEach, beforeEach, expect, test } from "vitest";
import { opensThread, requestThread, takeThreadRequest } from "./open-thread";

/** A card the way StatusCard builds one, around its own permalink. */
const buildCard = () => {
  const card = document.createElement("article");
  card.innerHTML = `
    <a href="/statuses/1" data-role="own">Aug 1</a>
    <p data-role="body">Hello <a href="https://elsewhere.example" data-role="other">a link</a></p>
    <button type="button" data-role="control">react</button>
  `;
  document.body.append(card);
  const pick = (role: string): HTMLElement => {
    const found = card.querySelector<HTMLElement>(`[data-role="${role}"]`);
    if (found === null) throw new Error(`no ${role} in the fixture`);
    return found;
  };
  return { card, pick, ownLink: pick("own") };
};

/**
 * Dispatches one click at `from` and reports what `opensThread` made of it —
 * read from a listener on the card, where the delegated handler reads it.
 */
const clickAt = (
  from: Element,
  card: Element,
  ownLink: Element | undefined,
  init: MouseEventInit = {},
): boolean => {
  let verdict: boolean | undefined;
  const listener = (event: Event) => {
    verdict = opensThread(event as MouseEvent, ownLink);
  };
  card.addEventListener("click", listener);
  from.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    }),
  );
  card.removeEventListener("click", listener);
  if (verdict === undefined)
    throw new Error("the click never reached the card");
  return verdict;
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  // The record is module state; a test that leaves one armed would answer the
  // next one's question.
  takeThreadRequest("drain");
});

test("a plain tap on the card surface opens the conversation", () => {
  const { card, pick, ownLink } = buildCard();
  expect(clickAt(pick("body"), card, ownLink)).toBe(true);
});

test("the card's own permalink is the same navigation, not a second one", () => {
  const { card, ownLink } = buildCard();
  expect(clickAt(ownLink, card, ownLink)).toBe(true);
});

test("a link and a control inside the card keep their own tap", () => {
  const { card, pick, ownLink } = buildCard();
  expect(clickAt(pick("other"), card, ownLink)).toBe(false);
  expect(clickAt(pick("control"), card, ownLink)).toBe(false);
});

test("a click something else already handled is left alone", () => {
  // What a nested card does: it claims the click before it reaches the card
  // around it (QuoteCard.tsx).
  const { card, pick, ownLink } = buildCard();
  const body = pick("body");
  body.addEventListener("click", (event) => event.preventDefault());
  expect(clickAt(body, card, ownLink)).toBe(false);
});

test.each([
  ["middle", { button: 1 }],
  ["command", { metaKey: true }],
  ["control", { ctrlKey: true }],
  ["shift", { shiftKey: true }],
  ["alt", { altKey: true }],
])("a %s click keeps its native meaning", (_name, init) => {
  const { card, pick, ownLink } = buildCard();
  expect(clickAt(pick("body"), card, ownLink, init)).toBe(false);
});

test("a click that arrives without an element target is not a card tap", () => {
  const { ownLink } = buildCard();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  window.dispatchEvent(event);

  expect(event.target).not.toBeInstanceOf(Element);
  expect(opensThread(event, ownLink)).toBe(false);
});

test("a card with no permalink of its own still opens on its surface", () => {
  const { card, pick } = buildCard();
  expect(clickAt(pick("body"), card, undefined)).toBe(true);
});

test("a standing text selection means the reader was selecting, not tapping", () => {
  const { card, pick, ownLink } = buildCard();
  const body = pick("body");
  const range = document.createRange();
  range.selectNodeContents(body);
  const selection = window.getSelection();
  if (selection === null) throw new Error("no selection in this environment");
  selection.removeAllRanges();
  selection.addRange(range);

  expect(selection.isCollapsed).toBe(false);
  expect(clickAt(body, card, ownLink)).toBe(false);
});

test("an arrival claims the request that named it, once", () => {
  requestThread("110000000000000002");

  expect(takeThreadRequest("110000000000000002")).toBe(true);
  // A rebuild that asks again is not a second arrival.
  expect(takeThreadRequest("110000000000000002")).toBe(false);
});

test("an arrival the request did not name consumes it all the same", () => {
  // A request the router turned down must not be waiting for a later arrival
  // to mistake for its own.
  requestThread("110000000000000002");

  expect(takeThreadRequest("110000000000000003")).toBe(false);
  expect(takeThreadRequest("110000000000000002")).toBe(false);
});
