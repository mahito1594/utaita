import { useBeforeLeave, useLocation } from "@solidjs/router";
import {
  createContext,
  createRenderEffect,
  type ParentProps,
  untrack,
  useContext,
} from "solid-js";

/**
 * What a page holds for as long as it is mounted: the content its history
 * frame was keeping for this path (undefined unless the reader came back onto
 * that entry), and the channel to hand its own content back on the way out.
 */
export type RetentionClaim<T> = {
  readonly restored: T | undefined;
  readonly retain: (snapshot: T) => void;
};

// Paths are compared as the router's own `location.pathname` spells them, so
// a navigation target is put through the same parse before it is matched
// against one. The origin is a placeholder; only the path is read back.
const targetPathname = (to: string): string =>
  new URL(to, "http://router.invalid").pathname;

// One history entry, as far as retention is concerned. The snapshot stays
// `unknown` so this module depends on no page's content shape.
type Frame = { readonly path: string; snapshot: unknown };

type RetentionStack = {
  claim: (path: string) => RetentionClaim<unknown>;
  mark: (path: string) => void;
};

// Every retaining route is mounted under the provider today; the no-op
// default only decides how a hypothetical provider-less one would fail — it
// degrades to a page that always fetches from the top, never throws.
const RetentionStackContext = createContext<RetentionStack>({
  claim: () => ({ restored: undefined, retain: () => {} }),
  mark: () => {},
});

/**
 * Called by a page during setup, before it builds its store: the claim
 * decides whether that store resumes or fetches its first page. `T` is the
 * caller's own snapshot shape — the stack never interprets it, and a given
 * path is only ever claimed by the one page that route resolves to. The
 * overload is what carries that shape across the untyped frame.
 */
export function claimRetentionFrame<T>(path: string): RetentionClaim<T>;
export function claimRetentionFrame(path: string): RetentionClaim<unknown> {
  return useContext(RetentionStackContext).claim(path);
}

/**
 * Called by a page that has no snapshot of its own, to take its place in the
 * stack anyway. Skipping it would misalign the stack with the history: a
 * profile, a conversation opened from it, and the same profile pushed again
 * from inside that conversation leave two frames for one path, and a pop past
 * an unmarked conversation would land on the newer of the two.
 */
export const markRetentionFrame = (path: string): void =>
  useContext(RetentionStackContext).mark(path);

/**
 * Pathless layout route holding the reading position of every page the reader
 * still has a history entry for (docs/adr/0004-data-fetching.md).
 *
 * The frames mirror that history, and a page resumes only when the reader
 * pops back onto its entry. Pushing a path that is already in the stack is a
 * fresh visit and starts from the top — the same verdict `<Router
 * scrollRestoration>` reaches, which restores nothing for a push, so a
 * resuming push would hand back old content scrolled to the top. Pops
 * truncate the stack down to the frame they land on, dropping the entries the
 * reader can no longer reach along with it.
 *
 * What a frame keeps is a snapshot — content by reference plus whatever
 * verdict rode along with it — and never a live store. A store builds memos,
 * and a memo belongs to the owner active when it is created; a store built
 * lazily from inside a page would be owned by that page and freeze the moment
 * the page is disposed, leaving the next one reading dead signals and firing
 * fetches against a gate that can no longer close.
 *
 * `signedIn` is the session as the caller sees it, not something read from
 * storage here: `src/entities` does not depend on `src/app` (see
 * .dependency-cruiser.cjs).
 */
export const Retention = (props: ParentProps<{ signedIn: boolean }>) => {
  // Deliberately not signals: a snapshot is read once, when a page builds its
  // store, and written once, when that page goes away. Reactive storage would
  // let a mounted page re-render from content it no longer owns.
  let stack: Frame[] = [];
  let pushedTo: string | undefined;

  const location = useLocation();

  // How a pop is told from a push. The router announces a push or a replace
  // with a string `to` and a browser back/forward with a number (the history
  // delta), while a memory history traverses without announcing at all
  // (`navigateFromRoute` and the browser history's `init` in
  // node_modules/@solidjs/router/dist/index.js). A string is therefore the
  // only positive signal, and "no push was announced" identifies a pop on
  // both integrations.
  //
  // The target is remembered rather than a bare flag because the announcement
  // is not addressed to anyone: a route that claims no frame (a conversation
  // still loading, say) would leave a flag set for whichever page comes next.
  // Matching the announcement against where the reader actually ended up
  // answers the question per arrival instead.
  useBeforeLeave((e) => {
    const to = e.to;
    if (typeof to === "string") pushedTo = targetPathname(to);
  });

  // Dropping the stack is explicit rather than a consequence of this component
  // being disposed. The gate above it is a non-keyed `<Show>`: widen its
  // condition (to let public routes render signed-out, say) and signing out
  // becomes a truthy→truthy transition that disposes nothing, silently
  // carrying one reader's history into the next session. A render effect, so
  // the reset settles in the same pure phase the routes below are recreated
  // in — a post-render effect could run after the next page has claimed.
  createRenderEffect(() => {
    if (!props.signedIn) stack = [];
  });

  const enter = (path: string): Frame => {
    // Untracked: a page claims from its setup, which the router may well run
    // inside a computation — subscribing it to the location would have every
    // navigation rebuild the page.
    const pushed = pushedTo === untrack(() => location.pathname);
    pushedTo = undefined;
    const landing = pushed
      ? undefined
      : stack.findLast((frame) => frame.path === path);
    if (landing === undefined) {
      // No match on a pop either — a forward traversal, or the first arrival
      // of the session. Nothing to resume, so this becomes the new top.
      const frame: Frame = { path, snapshot: undefined };
      stack.push(frame);
      return frame;
    }
    stack.length = stack.indexOf(landing) + 1;
    return landing;
  };

  const claim = (path: string): RetentionClaim<unknown> => {
    const frame = enter(path);
    return {
      restored: frame.snapshot,
      // Writes to this page's own frame rather than to the top of the stack,
      // which is what makes the router creating the next page before disposing
      // this one harmless: the write lands in the frame a pop back onto this
      // entry will find, never in the successor's, and a frame a pop has
      // already truncated away is one nobody will read.
      retain: (snapshot) => {
        frame.snapshot = snapshot;
      },
    };
  };

  return (
    <RetentionStackContext.Provider value={{ claim, mark: enter }}>
      {props.children}
    </RetentionStackContext.Provider>
  );
};
