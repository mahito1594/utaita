import { A } from "@solidjs/router";
import RotateCw from "lucide-solid/icons/rotate-cw";
import {
  type Accessor,
  createContext,
  createSignal,
  onCleanup,
  onMount,
  type ParentProps,
  useContext,
} from "solid-js";
import { css } from "../../../styled-system/css";
import { bubble, federated, home, local } from "./timelines";

// Panel enclosure (wireframe: docs/design/timeline-refresh-20260719.html —
// supersedes the flush-strip and detached-strip interim treatments): a
// flush strip under the header read as a broken second header on desktop
// (the header is viewport-wide, the strip column-wide); a detached
// card-style strip then read as an unrelated card. Containment — one
// bordered, rounded panel whose top edge is the bar — is what shows the bar
// and the list belong together. CRITICAL: never `overflow: hidden` here —
// clipping the panel would re-scope the bar's `position: sticky` away from
// the viewport.
const panel = css({
  // Base (mobile): the column already spans the viewport width, so the
  // panel stays invisible — no border/radius/padding — and the bar alone
  // carries the flush full-bleed treatment below, pixel-identical to the
  // pre-panel design.
  //
  // `md`, matching App.tsx's `column.maxWidth: { md: "600px" }`: the column
  // is only capped from `md` up, so "flush, full-bleed bar" and "column is
  // uncapped" are the same condition by construction — no viewport width
  // can produce a capped-but-still-flush band (a bespoke 600px breakpoint
  // synced by comment across two files was tried and dropped in favor of
  // this structural invariant).
  md: {
    borderWidth: "1px",
    borderColor: "border.default",
    // One step above the cards' `lg` (errorBox, StatusCard), matching the
    // comp's 12px — the panel is a container, not a card itself.
    borderRadius: "xl",
  },
});

// Body of the panel: the existing column gap between rows, plus the
// panel's own inset once the panel has a border to inset from. `pt` is
// unconditional so the bar→first-card gap always matches the inter-card
// gap ("3"), now that they're siblings with no shared flex `gap` between
// them (the panel restructure made the bar a sibling of this flex column
// rather than its first child).
// `md` sets `px`/`pb` rather than `p`, not `pt`, so it never collides with
// the base `pt` on the same property (cascade-order-dependent) — the
// effective padding is still 12px on all sides once `md` applies.
const panelBody = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  pt: "3",
  md: {
    px: "3",
    pb: "3",
  },
});

// The panel's top edge: carries the timeline switcher tabs and the manual
// refresh control side by side — kept as its own row rather than folded
// into the refresh button.
const bar = css({
  position: "sticky",
  top: "0",
  bg: "bg.surface",
  borderColor: "border.default",
  // No z-index scale in this project's tokens (only colors are governed by
  // the semantic-token rule) — a raw value just keeps the sticky bar above
  // card internals (MediaGrid, PollView) that create their own stacking
  // context.
  zIndex: "1",
  // Never a scroll-anchor candidate: see TimelinePage's gapRow/sentinelRow —
  // the bar is sticky, not part of the scrolling content, and must not be
  // chosen over a card.
  overflowAnchor: "none",
  px: "4",
  py: "2",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  // Base (mobile): the panel enclosing this is invisible, so these negative
  // margins still have to reach past `main`'s own px-4/py-4 (App.tsx)
  // themselves — the bar's edges meet the header's flush, matching its width
  // there.
  mx: "-4",
  mt: "-4",
  borderBottomWidth: "1px",
  // `md`+ (see `panel` for why `md` is the right condition): no more
  // escaping to do — the panel now carries the border. The bar just
  // sits flush against the panel's own top edge, with a matching top radius
  // standing in for the `overflow: hidden` clip we deliberately don't use
  // (CRITICAL, see `panel`).
  md: {
    mx: "0",
    mt: "0",
    borderTopRadius: "xl",
  },
});

// `minWidth: 0` overrides the flex item default (`auto`), which would
// otherwise keep this row at its content width and defeat its own
// `overflowX: auto` — the row needs to be allowed to shrink before it can
// scroll instead of overflow the bar at narrow widths.
const timelineNav = css({
  display: "flex",
  gap: "3",
  minWidth: "0",
  overflowX: "auto",
});

// Router-driven active styling (`aria-current="page"`, set by `<A>` itself
// on an exact path match) rather than a second, hand-maintained active
// state — the plain link color is the inactive look, matching the weight
// and size of the static "Home" label the tabs replaced.
const timelineNavLink = css({
  color: "text.muted",
  fontWeight: "semibold",
  fontSize: "sm",
  whiteSpace: "nowrap",
  "&[aria-current=page]": {
    color: "text.brand",
  },
});

// 40px ghost icon button (wireframe): borderless, transparent until
// hovered, so it reads as part of the strip rather than a separate control.
// `aria-label` carries the accessible name so it stays "Refresh" regardless
// of the icon shown.
const refreshButton = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "10",
  height: "10",
  borderRadius: "md",
  bg: "transparent",
  color: "accent.default",
  cursor: "pointer",
  _hover: { bg: "bg.subtle" },
  _disabled: { color: "text.muted", cursor: "default" },
});

// Rotates while a refresh is in flight; Panda's built-in `spin` keyframe
// (bundled by the default preset-panda preset, confirmed in
// styled-system/tokens) covers it. `_motionReduce` swaps the spin for a
// static, dimmed icon instead of leaving it running (wireframe).
const refreshIconSpinning = css({
  animation: "spin",
  _motionReduce: {
    animation: "none",
    opacity: "0.5",
  },
});

// What the bar's refresh button needs from whichever timeline page is
// mounted below it. Deliberately narrow: the shell drives the control, the
// page owns the store.
export type TimelineControls = {
  loading: Accessor<boolean>;
  refresh: () => void;
};

type ControlsChannel = {
  publish: (controls: TimelineControls) => void;
  withdraw: (controls: TimelineControls) => void;
};

// The bar outlives the page it belongs to — that is the whole point of the
// shell — so the two cannot be wired by props across the router outlet. The
// page publishes its controls here and withdraws them when it is disposed.
// Every timeline route is mounted under the shell today; the no-op default
// only decides how a hypothetical shell-less one would fail — it degrades
// to a page with no bar controls rather than throwing.
const ControlsChannelContext = createContext<ControlsChannel>({
  publish: () => {},
  withdraw: () => {},
});

// Called by the timeline page during setup. Withdrawal is identity-checked
// so a disposing page can never clobber a successor that already published
// its own controls — the router's dispose/create ordering is its own
// business, not something this contract should depend on.
export const publishTimelineControls = (controls: TimelineControls): void => {
  const channel = useContext(ControlsChannelContext);
  onMount(() => channel.publish(controls));
  onCleanup(() => channel.withdraw(controls));
};

// Layout route wrapping the four timeline routes. The switcher tabs live
// here, not in the page, precisely because the page is destroyed and
// recreated on every switch (one `<Route>` per timeline — App.tsx): a nav
// rendered inside it would take the focused `<a>` down with it and drop
// keyboard focus to `<body>` on every tab activation. This route's own
// definition is shared by all four leaves, so solid-router keeps it — and
// the focused link — mounted across the switch.
export const TimelineShell = (props: ParentProps) => {
  const [controls, setControls] = createSignal<TimelineControls>();
  const channel: ControlsChannel = {
    publish: (published) => setControls(published),
    withdraw: (withdrawn) =>
      setControls((current) => (current === withdrawn ? undefined : current)),
  };

  const loading = () => controls()?.loading() ?? false;

  // `aria-disabled`, not the `disabled` attribute: the HTML focus-fixup
  // rule forcibly blurs a focused element to `<body>` the instant it
  // becomes disabled, which would fire mid-click here (`refresh` sets
  // `loading` before its first await) and break the focus-retention
  // contract the page's live region exists to serve. The store's
  // `refreshInFlight` already absorbs re-entrant clicks; this guard exists
  // so the semantic state (aria-disabled) and the actual behavior (click is
  // a no-op) agree.
  const handleRefreshClick = () => {
    const current = controls();
    if (current === undefined || current.loading()) return;
    current.refresh();
  };

  return (
    <ControlsChannelContext.Provider value={channel}>
      <div class={panel}>
        <div class={bar}>
          <nav aria-label="Timelines" class={timelineNav}>
            <A href={home.path} end class={timelineNavLink}>
              {home.label}
            </A>
            <A href={local.path} end class={timelineNavLink}>
              {local.label}
            </A>
            <A href={bubble.path} end class={timelineNavLink}>
              {bubble.label}
            </A>
            <A href={federated.path} end class={timelineNavLink}>
              {federated.label}
            </A>
          </nav>
          <button
            type="button"
            aria-label="Refresh"
            aria-busy={loading() ? "true" : undefined}
            aria-disabled={loading() ? "true" : undefined}
            onClick={handleRefreshClick}
            class={refreshButton}
          >
            <RotateCw
              size={20}
              aria-hidden="true"
              {...(loading() ? { class: refreshIconSpinning } : {})}
            />
          </button>
        </div>

        <div class={panelBody}>{props.children}</div>
      </div>
    </ControlsChannelContext.Provider>
  );
};
