import { Route, Router } from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Show, Suspense } from "solid-js";
import { css, cx } from "../../styled-system/css";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { TimelinePage } from "../pages/timeline/TimelinePage";
import { TimelineShell } from "../pages/timeline/TimelineShell";
import { bubble, federated, home, local } from "../pages/timeline/timelines";
import { outlineButton } from "../ui/outline-button";
import { LoginScreen } from "./LoginScreen";
import { OAuthCallback } from "./OAuthCallback";
import { REDIRECT_PATH } from "./oauth";
import { authenticated, logout } from "./session";

// Single centered column, capped only from `md` up (app-shell wireframe
// decision); shared by header and main so their edges align. Below `md` the
// column is full viewport width — this is the invariant the timeline's
// panel/bar treatment keys off of (TimelineShell.tsx): the flush, full-bleed
// bar is only correct exactly while the column is uncapped, so both key off
// the same `md` condition instead of syncing a width literal across files.
const column = { maxWidth: { md: "600px" }, mx: "auto", px: "4" } as const;

// The app's one ErrorBoundary. API failures never land here — they travel as
// Result values down to the page that rendered them (ADR-0008); anything
// caught here is a genuine bug.
const Layout = (props: ParentProps) => (
  <>
    <header
      class={css({
        bg: "bg.surface",
        borderBottomWidth: "1px",
        borderColor: "border.default",
      })}
    >
      <div
        class={css({
          ...column,
          py: "3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <h1
          class={css({
            fontSize: "lg",
            fontWeight: "semibold",
            color: "text.brand",
          })}
        >
          utaita
        </h1>
        <Show when={authenticated()}>
          <button
            type="button"
            onClick={() => void logout()}
            class={cx(
              outlineButton({ tone: "neutral" }),
              css({ color: "text.muted" }),
            )}
          >
            Log out
          </button>
        </Show>
      </div>
    </header>
    <main class={css({ ...column, py: "4" })}>
      <ErrorBoundary
        fallback={(err) => <p>Something went wrong: {String(err)}</p>}
      >
        <Suspense
          fallback={
            <p role="status" class={css({ color: "text.muted" })}>
              Loading…
            </p>
          }
        >
          {props.children}
        </Suspense>
      </ErrorBoundary>
    </main>
  </>
);

// The gate is a layout route, not a redirect: unauthenticated visits render
// the login screen in place at whatever URL was opened — no /login URL
// exists. The opened URL does not survive a full login, though: the OAuth
// return leg always lands on "/", so a deep link into any other route is
// lost across a sign-in (backlogged under the login story in
// docs/stories.ja.md). The callback sits outside as a sibling so the gate
// can never swallow the return leg (discussion decision 2026-07-12).
const AuthGate = (props: ParentProps) => (
  <Show when={authenticated()} fallback={<LoginScreen />}>
    {props.children}
  </Show>
);

// One `<Route>` entry per timeline rather than a single dynamic-segment
// route: a distinct path is what makes solid-router remount `TimelinePage`
// (and so create a fresh store) on every tab switch — a `:timeline` param
// route would instead keep the same instance alive across a param change.
// The paths come from the definitions the switcher tabs link to, so the
// route table and the tabs cannot drift into a link that matches nothing.
const HomeTimelinePage = () => <TimelinePage timeline={home} />;
const LocalTimelinePage = () => <TimelinePage timeline={local} />;
const BubbleTimelinePage = () => <TimelinePage timeline={bubble} />;
const FederatedTimelinePage = () => <TimelinePage timeline={federated} />;

const App = () => (
  <Router root={Layout}>
    <Route path={REDIRECT_PATH} component={OAuthCallback} />
    <Route component={AuthGate}>
      {/* The four leaves share this one route definition, which is what
          keeps the shell's switcher tabs (and the focused link among them)
          mounted while the page below them is recreated. */}
      <Route component={TimelineShell}>
        <Route path={home.path} component={HomeTimelinePage} />
        <Route path={local.path} component={LocalTimelinePage} />
        <Route path={bubble.path} component={BubbleTimelinePage} />
        <Route path={federated.path} component={FederatedTimelinePage} />
      </Route>
      {/* /@:acct is not expressible in solid-router (a segment is dynamic
          only when it starts with ":"), hence /users/ — see profilePath */}
      <Route path="/users/:acct" component={ProfilePage} />
    </Route>
  </Router>
);

export default App;
